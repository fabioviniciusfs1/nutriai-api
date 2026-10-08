import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ANTHROPIC_CLIENT, CLAUDE_MODEL } from '../../ai/anthropic.provider.js';
import { CatalogService } from '../../catalog/catalog.service.js';
import type { FoodFeedback } from '../../contract.js';
import { FoodCatalog } from '../engine/foods.js';
import type { MealSuggestion } from '../engine/types.js';
import {
  catalogPrompt,
  COMPOSER_INSTRUCTIONS,
  COMPOSITION_SCHEMA,
  compositionPrompt,
  parseComposition,
  type CompositionRequest,
} from './composition.js';
import {
  parseSubstitutes,
  SUBSTITUTE_INSTRUCTIONS,
  SUBSTITUTES_SCHEMA,
  substitutePrompt,
  type SubstituteRequest,
} from './substitution.js';

/** Tempo máximo de espera pela composição (a prévia fica aguardando). */
const COMPOSE_TIMEOUT_MS = 20_000;

/** Tempo máximo de espera pelos substitutos (o diálogo de troca fica aguardando). */
const SUBSTITUTES_TIMEOUT_MS = 15_000;

/** Quanto tempo a sugestão da prévia fica guardada para o "criar" usar a mesma. */
const DRAFT_TTL_MS = 15 * 60 * 1000;

/**
 * Compõe refeições novas e sugere substitutos de alimentos com o Claude a partir do catálogo (TACO). Sem
 * cliente, ou se a chamada falhar, devolve `null` e o plano usa a lista fixa de sugestões / os substitutos
 * do mesmo grupo.
 */
@Injectable()
export class MealComposerService {
  private readonly logger = new Logger(MealComposerService.name);
  /** Sugestões das prévias, por usuário + nome + horário. */
  private readonly drafts = new Map<
    string,
    { suggestion: MealSuggestion; expires: number }
  >();

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: Anthropic | null,
    private readonly catalog: CatalogService,
  ) {}

  get available() {
    return this.anthropic !== null;
  }

  private key(userId: string, title: string, time: string) {
    return `${userId}|${title.trim().toLowerCase()}|${time}`;
  }

  /** Compõe para a prévia e guarda, para o "criar" da mesma refeição usar a mesma sugestão. */
  async composeForPreview(
    userId: string,
    request: CompositionRequest,
    feedback: Record<string, FoodFeedback>,
  ): Promise<MealSuggestion | null> {
    const suggestion = await this.compose(request, feedback);
    if (suggestion) {
      this.drafts.set(this.key(userId, request.title, request.time), {
        suggestion,
        expires: Date.now() + DRAFT_TTL_MS,
      });
    }
    return suggestion;
  }

  /** A sugestão da prévia (se ainda vale e não usa alimento restrito depois); senão, compõe uma nova. */
  async composeForCreate(
    userId: string,
    request: CompositionRequest,
    feedback: Record<string, FoodFeedback>,
  ): Promise<MealSuggestion | null> {
    const key = this.key(userId, request.title, request.time);
    const draft = this.drafts.get(key);
    this.drafts.delete(key);
    if (
      draft &&
      draft.expires > Date.now() &&
      !draft.suggestion.foods.some((food) => feedback[food.name])
    ) {
      return draft.suggestion;
    }
    return this.compose(request, feedback);
  }

  private async compose(
    request: CompositionRequest,
    feedback: Record<string, FoodFeedback>,
  ): Promise<MealSuggestion | null> {
    this.pruneDrafts();
    const text = await this.ask({
      task: 'Composição de refeição',
      instructions: COMPOSER_INSTRUCTIONS,
      prompt: compositionPrompt(request),
      schema: COMPOSITION_SCHEMA,
      maxTokens: 2000,
      // A prévia espera esta chamada: sem resposta rápida, usa a lista fixa.
      timeout: COMPOSE_TIMEOUT_MS,
    });
    if (text === null) return null;
    const suggestion = parseComposition(
      text,
      new FoodCatalog((await this.catalog.catalog()).foods),
      feedback,
      request.time,
    );
    if (!suggestion)
      this.logger.warn(
        'Composição de refeição sem alimentos válidos do catálogo.',
      );
    return suggestion;
  }

  /**
   * Nomes de substitutos para o alimento, sugeridos pelo Claude e conferidos no catálogo (até 8, na ordem
   * dele). `null` sem cliente, se a chamada falhar ou se nenhum nome existir no catálogo.
   */
  async suggestSubstitutes(
    request: SubstituteRequest,
    feedback: Record<string, FoodFeedback>,
  ): Promise<string[] | null> {
    const text = await this.ask({
      task: 'Sugestão de substitutos',
      instructions: SUBSTITUTE_INSTRUCTIONS,
      prompt: substitutePrompt(request),
      schema: SUBSTITUTES_SCHEMA,
      maxTokens: 1000,
      // O diálogo de troca espera esta chamada: sem resposta rápida, usa os do mesmo grupo.
      timeout: SUBSTITUTES_TIMEOUT_MS,
    });
    if (text === null) return null;
    const names = parseSubstitutes(
      text,
      new FoodCatalog((await this.catalog.catalog()).foods),
      feedback,
      request.food.name,
    );
    if (names.length === 0) {
      this.logger.warn('Sugestão de substitutos sem alimentos do catálogo.');
      return null;
    }
    return names;
  }

  /**
   * Pergunta ao Claude com o catálogo no system (em cache) e resposta em JSON pelo `schema`. Devolve o
   * texto da resposta, ou `null` sem cliente, com erro ou resposta incompleta (o erro fica no log).
   */
  private async ask(options: {
    task: string;
    instructions: string;
    prompt: string;
    schema: Record<string, unknown>;
    maxTokens: number;
    timeout: number;
  }): Promise<string | null> {
    if (!this.anthropic) return null;
    const foods = (await this.catalog.catalog()).foods;
    try {
      const response = await this.anthropic.messages.create(
        {
          model: CLAUDE_MODEL,
          max_tokens: options.maxTokens,
          system: [
            { type: 'text', text: options.instructions },
            // O catálogo não muda entre chamadas: fica em cache.
            {
              type: 'text',
              text: `Catálogo:\n${catalogPrompt(foods)}`,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: options.prompt }],
          output_config: {
            format: { type: 'json_schema', schema: options.schema },
          },
        },
        { timeout: options.timeout, maxRetries: 1 },
      );
      if (
        response.stop_reason === 'refusal' ||
        response.stop_reason === 'max_tokens'
      ) {
        this.logger.warn(
          `${options.task} sem resposta completa (stop_reason ${response.stop_reason}).`,
        );
        return null;
      }
      return response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('');
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        this.logger.warn(
          `API da Anthropic (${options.task.toLowerCase()}): ${error.status} ${error.message}`,
        );
      } else {
        this.logger.warn(
          `${options.task}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return null;
    }
  }

  private pruneDrafts() {
    const now = Date.now();
    for (const [key, draft] of this.drafts)
      if (draft.expires <= now) this.drafts.delete(key);
  }
}
