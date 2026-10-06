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

/** Tempo máximo de espera pela composição (a prévia fica aguardando). */
const COMPOSE_TIMEOUT_MS = 20_000;

/** Quanto tempo a sugestão da prévia fica guardada para o "criar" usar a mesma. */
const DRAFT_TTL_MS = 15 * 60 * 1000;

/**
 * Compõe refeições novas com o Claude a partir do catálogo (TACO). Sem cliente, ou se a chamada falhar,
 * devolve `null` e o plano usa a lista fixa de sugestões.
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
    if (!this.anthropic) return null;
    this.pruneDrafts();
    const foods = (await this.catalog.catalog()).foods;
    try {
      const response = await this.anthropic.messages.create(
        {
          model: CLAUDE_MODEL,
          max_tokens: 2000,
          system: [
            { type: 'text', text: COMPOSER_INSTRUCTIONS },
            // O catálogo não muda entre chamadas: fica em cache.
            {
              type: 'text',
              text: `Catálogo:\n${catalogPrompt(foods)}`,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: compositionPrompt(request) }],
          output_config: {
            format: { type: 'json_schema', schema: COMPOSITION_SCHEMA },
          },
        },
        // A prévia espera esta chamada: sem resposta rápida, usa a lista fixa.
        { timeout: COMPOSE_TIMEOUT_MS, maxRetries: 1 },
      );
      if (
        response.stop_reason === 'refusal' ||
        response.stop_reason === 'max_tokens'
      ) {
        this.logger.warn(
          `Composição de refeição sem resposta completa (stop_reason ${response.stop_reason}).`,
        );
        return null;
      }
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('');
      const suggestion = parseComposition(
        text,
        new FoodCatalog(foods),
        feedback,
        request.time,
      );
      if (!suggestion)
        this.logger.warn(
          'Composição de refeição sem alimentos válidos do catálogo.',
        );
      return suggestion;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        this.logger.warn(
          `API da Anthropic na composição de refeição: ${error.status} ${error.message}`,
        );
      } else {
        this.logger.warn(
          `Composição de refeição: ${error instanceof Error ? error.message : String(error)}`,
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
