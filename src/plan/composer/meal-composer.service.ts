import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ANTHROPIC_CLIENT,
  CLAUDE_MODEL,
  CLAUDE_PLAN_MODEL,
} from '../../ai/anthropic.provider.js';
import { OutOfCreditException } from '../../ai/credit.js';
import { LlmLogService } from '../../ai/llm-log.service.js';
import { CatalogService } from '../../catalog/catalog.service.js';
import type { AvoidRule, Diet, FoodFeedback } from '../../contract.js';
import type { LlmTask } from '../../database/entities/index.js';
import {
  genericFood,
  needsOffFood,
  offSearchWords,
} from '../../database/sources/off/generic.js';
import { OffProductsService } from '../../foods/off-products.service.js';
import { avoidMatcher } from '../engine/avoid.js';
import { allowedByDiet } from '../engine/diet.js';
import { FoodCatalog } from '../engine/foods.js';
import type { PersonalMeals } from '../engine/types.js';
import type { CitedFood } from './composition.js';
import {
  MEAL_TIME_INSTRUCTIONS,
  MEAL_TIME_SCHEMA,
  mealTimePrompt,
  parseMealTimeAdvice,
  type MealTimeAdvice,
  type MealTimeRequest,
} from './meal-time.js';
import {
  parsePersonalPlan,
  personalPlanCitedFoods,
  planAllows,
  PERSONAL_PLAN_INSTRUCTIONS,
  PERSONAL_PLAN_SCHEMA,
  personalPlanPrompt,
  type PersonalPlanRequest,
} from './personal-plan.js';
import {
  parseSubstitutes,
  substituteCitedFoods,
  SUBSTITUTE_INSTRUCTIONS,
  SUBSTITUTES_SCHEMA,
  substitutePrompt,
  type SubstituteRequest,
} from './substitution.js';

/** Tempo máximo de espera pelos substitutos (o diálogo de troca fica aguardando). */
const SUBSTITUTES_TIMEOUT_MS = 15_000;

/** Tempo máximo de espera pela avaliação do horário (o diálogo de horário fica aguardando). */
const MEAL_TIME_TIMEOUT_MS = 10_000;

/** Tempo máximo de espera pelo plano individual (roda em segundo plano). */
const PERSONAL_PLAN_TIMEOUT_MS = 120_000;

/** Só os alimentos do catálogo que cabem no tipo de alimentação e não caem nos "Alimentos que você não come". */
function dietFilter(catalog: FoodCatalog, diet: Diet, avoid: AvoidRule[] = []) {
  const avoided = avoidMatcher(avoid);
  return (name: string) => {
    const entry = catalog.entry(name);
    return entry !== undefined && allowedByDiet(entry, diet) && !avoided(name);
  };
}

/**
 * Monta o plano individual e sugere substitutos de alimentos com o Claude, conferindo no catálogo (TACO e
 * TBCA, e os genéricos do Open Food Facts para o que falta nelas) os alimentos que ele cita. Sem cliente, ou se a chamada falhar, devolve `null` e o plano usa as refeições padrão / os substitutos do
 * mesmo grupo.
 */
@Injectable()
export class MealComposerService {
  private readonly logger = new Logger(MealComposerService.name);

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: Anthropic | null,
    private readonly catalog: CatalogService,
    private readonly llmLog: LlmLogService,
    private readonly products: OffProductsService,
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
    const catalog = await this.catalogWithOffFoods(substituteCitedFoods(text));
    const inDiet = dietFilter(catalog, request.diet, request.avoid);
    const excluded = new Set(request.exclude);
    const names = parseSubstitutes(
      text,
      catalog,
      feedback,
      request.food.name,
      (name) => inDiet(name) && !excluded.has(name),
      request.exclude,
    );
    if (names.length === 0) {
      this.logger.warn('Sugestão de substitutos sem alimentos do catálogo.');
      return null;
    }
    return names;
  }

  /**
   * O que o Claude acha do novo horário de uma refeição, conferido (`parseMealTimeAdvice`). `null` sem cliente,
   * se a chamada falhar ou se a resposta não servir: o horário é salvo sem aviso.
   */
  async checkMealTime(
    userId: string,
    request: MealTimeRequest,
  ): Promise<MealTimeAdvice | null> {
    const text = await this.ask({
      task: 'Horário da refeição',
      log: 'meal-time',
      userId,
      instructions: MEAL_TIME_INSTRUCTIONS,
      prompt: mealTimePrompt(request),
      schema: MEAL_TIME_SCHEMA,
      // O Haiku pensa antes de responder, e o raciocínio também conta no limite.
      maxTokens: 16000,
      timeout: MEAL_TIME_TIMEOUT_MS,
    });
    if (text === null) return null;
    const advice = parseMealTimeAdvice(text, request.time, request.routine);
    if (!advice)
      this.logger.warn('Avaliação do horário com resposta inválida.');
    return advice;
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
    const catalog = await this.catalogWithOffFoods(
      personalPlanCitedFoods(text),
    );
    const meals = parsePersonalPlan(
      text,
      catalog,
      feedback,
      planAllows(
        catalog,
        dietFilter(catalog, request.routine.diet, request.avoid),
      ),
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
   * O catálogo para conferir os alimentos `cited`, com os genéricos do Open Food Facts dos que não existem na TACO
   * nem na TBCA (`needsOffFood`): cada um pela mediana dos produtos brasileiros com as palavras do nome
   * (`genericFood`), gravado em `foods` para as próximas vezes. Falha no Open Food Facts só vai para o log.
   */
  private async catalogWithOffFoods(cited: CitedFood[]): Promise<FoodCatalog> {
    const catalog = new FoodCatalog((await this.catalog.catalog()).foods);
    const missing = new Map<string, CitedFood>();
    for (const food of cited)
      if (
        !missing.has(food.name) &&
        needsOffFood(catalog, food.name, food.approx)
      )
        missing.set(food.name, food);
    if (missing.size === 0) return catalog;
    try {
      const added = [];
      for (const { name, approx } of missing.values()) {
        const stats = await this.products.medians(offSearchWords(name));
        const food = genericFood(catalog, name, approx, stats);
        if (!food) continue;
        added.push(food);
        this.logger.log(
          `Alimento do Open Food Facts: ${food.name} (${stats.count} produtos).`,
        );
      }
      if (added.length === 0) return catalog;
      await this.catalog.addFoods(added);
      return new FoodCatalog((await this.catalog.catalog()).foods);
    } catch (error) {
      this.logger.warn(
        `Open Food Facts: ${error instanceof Error ? error.message : String(error)}`,
      );
      return catalog;
    }
  }

  /**
   * Pergunta ao Claude com as instruções no system (em cache) e resposta em JSON pelo `schema`. Devolve o
   * texto da resposta, ou `null` sem cliente, com erro ou resposta incompleta (o erro fica no log). Sem créditos
   * na Anthropic, lança a `OutOfCreditException` (503 ao usuário, sem fallback).
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
     * Montagem do plano individual: usa o `CLAUDE_PLAN_MODEL` (esforço médio, para não demorar demais; os outros
     * pedidos, o `CLAUDE_MODEL`, também com esforço médio) e,
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
              // Substitutos e horário: o usuário espera no diálogo, mas a escolha precisa entender a função do
              // alimento no prato (com `low`, o Haiku trocava abacate por frango). Esforço médio.
              output_config: {
                effort: 'medium',
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
      // Sem créditos, o usuário fica sabendo (sem o fallback).
      if (error instanceof OutOfCreditException) throw error;
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
