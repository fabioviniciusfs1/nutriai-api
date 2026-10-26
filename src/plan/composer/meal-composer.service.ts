import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ANTHROPIC_CLIENT,
  CLAUDE_MODEL,
  CLAUDE_PLAN_MODEL,
} from '../../ai/anthropic.provider.js';
import { LlmLogService } from '../../ai/llm-log.service.js';
import { CatalogService } from '../../catalog/catalog.service.js';
import type { Diet, FoodFeedback } from '../../contract.js';
import type { LlmTask } from '../../database/entities/index.js';
import { allowedByDiet } from '../engine/diet.js';
import { FoodCatalog } from '../engine/foods.js';
import type { PersonalMeals } from '../engine/types.js';
import {
  parsePersonalPlan,
  PERSONAL_PLAN_INSTRUCTIONS,
  PERSONAL_PLAN_SCHEMA,
  personalPlanPrompt,
  type PersonalPlanRequest,
} from './personal-plan.js';
import {
  parseSubstitutes,
  SUBSTITUTE_INSTRUCTIONS,
  SUBSTITUTES_SCHEMA,
  substitutePrompt,
  type SubstituteRequest,
} from './substitution.js';

/** Tempo máximo de espera pelos substitutos (o diálogo de troca fica aguardando). */
const SUBSTITUTES_TIMEOUT_MS = 15_000;

/** Tempo máximo de espera pelo plano individual (roda em segundo plano). */
const PERSONAL_PLAN_TIMEOUT_MS = 120_000;

/** Só os alimentos do catálogo que cabem no tipo de alimentação. */
function dietFilter(catalog: FoodCatalog, diet: Diet) {
  return (name: string) => {
    const entry = catalog.entry(name);
    return entry !== undefined && allowedByDiet(entry, diet);
  };
}

/**
 * Monta o plano individual e sugere substitutos de alimentos com o Claude, conferindo no catálogo (TACO e
 * TBCA) os alimentos que ele cita. Sem cliente, ou se a chamada falhar, devolve `null` e o plano usa as refeições padrão / os substitutos do
 * mesmo grupo.
 */
@Injectable()
export class MealComposerService {
  private readonly logger = new Logger(MealComposerService.name);

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: Anthropic | null,
    private readonly catalog: CatalogService,
    private readonly llmLog: LlmLogService,
  ) {}

  get available() {
    return this.anthropic !== null;
  }

  /**
   * Nomes de substitutos para o alimento, sugeridos pelo Claude e conferidos no catálogo (até 8, na ordem
   * dele). `null` sem cliente, se a chamada falhar ou se nenhum nome existir no catálogo.
   */
  async suggestSubstitutes(
    userId: string,
    request: SubstituteRequest,
    feedback: Record<string, FoodFeedback>,
  ): Promise<string[] | null> {
    const text = await this.ask({
      task: 'Sugestão de substitutos',
      log: 'substitutes',
      userId,
      instructions: SUBSTITUTE_INSTRUCTIONS,
      prompt: substitutePrompt(request),
      schema: SUBSTITUTES_SCHEMA,
      // O Haiku pensa antes de responder, e o raciocínio também conta no limite.
      maxTokens: 16000,
      // O diálogo de troca espera esta chamada: sem resposta rápida, usa os do mesmo grupo.
      timeout: SUBSTITUTES_TIMEOUT_MS,
    });
    if (text === null) return null;
    const catalog = new FoodCatalog((await this.catalog.catalog()).foods);
    const inDiet = dietFilter(catalog, request.diet);
    const excluded = new Set(request.exclude);
    const names = parseSubstitutes(
      text,
      catalog,
      feedback,
      request.food.name,
      (name) => inDiet(name) && !excluded.has(name),
    );
    if (names.length === 0) {
      this.logger.warn('Sugestão de substitutos sem alimentos do catálogo.');
      return null;
    }
    return names;
  }

  /**
   * Refeições do plano individual do usuário, montadas pelo Claude e conferidas no catálogo. `null` sem
   * cliente, se a chamada falhar ou se alguma refeição pedida vier sem alimentos válidos.
   */
  async composePersonalPlan(
    userId: string,
    request: PersonalPlanRequest,
    feedback: Record<string, FoodFeedback>,
  ): Promise<PersonalMeals | null> {
    const text = await this.ask({
      task: 'Plano individual',
      log: 'personal-plan',
      userId,
      instructions: PERSONAL_PLAN_INSTRUCTIONS,
      prompt: personalPlanPrompt(request),
      schema: PERSONAL_PLAN_SCHEMA,
      // O Sonnet pensa antes de responder, e o raciocínio também conta no limite.
      maxTokens: 16000,
      // Roda em segundo plano: dá para esperar mais.
      timeout: PERSONAL_PLAN_TIMEOUT_MS,
      plan: true,
    });
    if (text === null) return null;
    const catalog = new FoodCatalog((await this.catalog.catalog()).foods);
    const meals = parsePersonalPlan(
      text,
      catalog,
      feedback,
      dietFilter(catalog, request.routine.diet),
      request.meals.map((meal) => meal.id),
      request.routine.eatingWindows,
      (from, to) =>
        this.logger.log(
          `Horários do plano individual ajustados: ${from.join(', ')} → ${to.join(', ')}.`,
        ),
    );
    if (!meals)
      this.logger.warn('Plano individual sem todas as refeições válidas.');
    return meals;
  }

  /**
   * Pergunta ao Claude com as instruções no system (em cache) e resposta em JSON pelo `schema`. Devolve o
   * texto da resposta, ou `null` sem cliente, com erro ou resposta incompleta (o erro fica no log).
   */
  private async ask(options: {
    task: string;
    /** Tarefa e usuário no log das chamadas (`llm_calls`). */
    log: LlmTask;
    userId: string;
    instructions: string;
    prompt: string;
    schema: Record<string, unknown>;
    maxTokens: number;
    timeout: number;
    /**
     * Montagem do plano individual: usa o `CLAUDE_PLAN_MODEL` (esforço médio, para não demorar demais) e,
     * se ele recusar, a API refaz com outro modelo (`fallbacks: 'default'`, beta).
     */
    plan?: boolean;
  }): Promise<string | null> {
    if (!this.anthropic) return null;
    try {
      // As instruções não mudam entre chamadas: ficam em cache. O catálogo não vai no pedido: o Claude cita
      // os alimentos e a resposta é conferida nele.
      const system: Anthropic.TextBlockParam[] = [
        {
          type: 'text',
          text: options.instructions,
          cache_control: { type: 'ephemeral' },
        },
      ];
      const messages: Anthropic.MessageParam[] = [
        { role: 'user', content: options.prompt },
      ];
      const request = { timeout: options.timeout, maxRetries: 1 };
      const anthropic = this.anthropic;
      const track = <T extends { model: string }, R extends object>(
        params: T,
        call: (params: T) => Promise<R>,
      ) =>
        this.llmLog.track(options.log, options.userId, params, () =>
          call(params),
        );
      const response = options.plan
        ? await track(
            {
              model: CLAUDE_PLAN_MODEL,
              max_tokens: options.maxTokens,
              system,
              messages,
              output_config: {
                effort: 'medium',
                format: { type: 'json_schema', schema: options.schema },
              },
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
            } satisfies Anthropic.Beta.MessageCreateParamsNonStreaming,
            (params) => anthropic.beta.messages.create(params, request),
          )
        : await track(
            {
              model: CLAUDE_MODEL,
              max_tokens: options.maxTokens,
              system,
              messages,
              // Escolher substitutos é simples, e o diálogo de troca espera: pouco raciocínio.
              output_config: {
                effort: 'low',
                format: { type: 'json_schema', schema: options.schema },
              },
            } satisfies Anthropic.MessageCreateParamsNonStreaming,
            (params) => anthropic.messages.create(params, request),
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
}
