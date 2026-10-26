import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service.js';
import type { UserClock } from '../common/timezone.js';
import type {
  DietPreview,
  DietSettings,
  FoodFeedback,
  MealTimeCheck,
  Personalization,
  PlanFood,
  PlanMeal,
  TodayPlan,
} from '../contract.js';
import { PlanStateEntity } from '../database/entities/index.js';
import { DayLogService } from './day-log.service.js';
import { outsideWindowsAdvice } from './composer/meal-time.js';
import { planNutrients } from './nutrients.js';
import { PlanVersionService } from './plan-version.service.js';
import { planChanges, planVersion } from './plan-versions.js';
import { FOOD_NOT_FOUND, Planner, PlanRuleError } from './engine/planner.js';
import {
  DEFAULT_PLANNER_OPTIONS,
  EMPTY_PLAN_CHANGES,
  type PlannerOptions,
  type PlanState,
} from './engine/types.js';
import { dietSettingsOf } from '../targets/diet.js';
import { calculateTargets, macroTargets } from '../targets/targets.js';
import type { SubstituteRequest } from './composer/substitution.js';
import { MealComposerService } from './composer/meal-composer.service.js';
import { UsersService } from '../users/users.service.js';

function toPlanState(entity: PlanStateEntity): PlanState {
  return {
    mealTimes: entity.mealTimes,
    // Mescla com o vazio: estados salvos antes de um campo existir continuam válidos.
    planChanges: { ...EMPTY_PLAN_CHANGES, ...entity.planChanges },
    foodFeedback: entity.foodFeedback,
    foodSubstitutes: entity.foodSubstitutes,
    mealFoodSwaps: entity.mealFoodSwaps,
    nextExtraId: entity.nextExtraId,
    personalMeals: entity.personalMeals,
  };
}

/**
 * Uma montagem `pending` mais velha que isso é tratada como falha (ex.: a API reiniciou no meio). Maior que o
 * tempo máximo da chamada ao Claude (2 min, com uma nova tentativa).
 */
const PERSONALIZATION_TIMEOUT_MS = 5 * 60 * 1000;

/** Estado da montagem do plano individual, com `pending` antiga virando `failed`. */
export function personalizationStatus(
  entity: Pick<PlanStateEntity, 'personalization' | 'personalizationAt'>,
  now = Date.now(),
): Personalization {
  if (
    entity.personalization === 'pending' &&
    (!entity.personalizationAt ||
      now - entity.personalizationAt.getTime() > PERSONALIZATION_TIMEOUT_MS)
  )
    return 'failed';
  return entity.personalization;
}

/** Linha do plano do usuário (criada vazia se não existir), travada até o fim da transação. */
export async function lockPlanState(manager: EntityManager, userId: string) {
  await manager
    .createQueryBuilder()
    .insert()
    .into(PlanStateEntity)
    .values({ userId })
    .orIgnore()
    .execute();
  return manager.findOneOrFail(PlanStateEntity, {
    where: { userId },
    lock: { mode: 'pessimistic_write' },
  });
}

/** Traduz um erro de regra do plano para o status HTTP. */
export function asHttpError(error: unknown): unknown {
  if (!(error instanceof PlanRuleError)) return error;
  return error.kind === 'not-found'
    ? new NotFoundException(error.message)
    : new BadRequestException(error.message);
}

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly dayLogs: DayLogService,
    private readonly versions: PlanVersionService,
    private readonly users: UsersService,
    private readonly composer: MealComposerService,
  ) {}

  /**
   * Metas de calorias e macronutrientes do perfil (com o ajuste da dieta), peso da unidade do ovo, refeições e
   * tipo de alimentação da rotina (sem perfil: porções originais; sem rotina: café da manhã, almoço e jantar, sem
   * restrição).
   */
  private async plannerOptions(
    userId: string,
    settings?: DietSettings,
  ): Promise<PlannerOptions> {
    const { profile, routine, dietSettings } = await this.users.get(userId);
    const diet = settings ?? dietSettingsOf(dietSettings);
    const macros = profile ? macroTargets(profile, diet) : null;
    return {
      calorieGoal: profile ? calculateTargets(profile).calories : null,
      macroGoals: macros && {
        protein: macros.proteinas,
        fat: macros.gorduras,
        carbs: macros.carboidratos,
      },
      eggUnitGrams: diet.eggUnitGrams,
      meals: routine?.meals ?? DEFAULT_PLANNER_OPTIONS.meals,
      diet: routine?.diet,
    };
  }

  /**
   * O que o assistente acha de mudar o horário da refeição para `time`, sem salvar. Sem perfil, sem o assistente
   * ou se ele falhar, a mudança passa (`ok`): a avaliação nunca impede trocar o horário.
   */
  async checkMealTime(
    userId: string,
    clock: UserClock,
    mealId: number,
    time: string,
  ): Promise<MealTimeCheck> {
    const ok: MealTimeCheck = {
      ok: true,
      message: null,
      suggestedTime: null,
      canKeep: true,
    };
    const [meals, { profile, routine }] = await Promise.all([
      this.read(userId, clock, (planner) => {
        planner.meal(mealId);
        return planner.plan.map(({ id, slot, title, time, totals }) => ({
          id,
          slot,
          title,
          time,
          kcal: totals.kcal,
        }));
      }),
      this.users.get(userId),
    ]);
    const current = meals.find((meal) => meal.id === mealId)!;
    if (current.time === time) return ok;
    const request = { profile, routine, meals, mealId, time };
    // Fora dos horários da rotina não precisa do assistente: a resposta é sempre a mesma.
    const outside = outsideWindowsAdvice(request);
    if (outside) return outside;
    if (!profile) return ok;
    return (
      (await this.composer.checkMealTime(userId, { ...request, profile })) ?? ok
    );
  }

  /**
   * Substitutos do alimento na refeição: sugeridos pelo assistente e conferidos no catálogo; sem ele (ou se
   * falhar), os do mesmo grupo mais parecidos. A chamada ao assistente fica fora da transação do plano.
   */
  async substitutes(
    userId: string,
    clock: UserClock,
    mealId: number,
    foodName: string,
    exclude: string[] = [],
  ): Promise<PlanFood[]> {
    const { routine } = await this.users.get(userId);
    const { request, feedback } = await this.read(userId, clock, (planner) => {
      const meal = planner.meal(mealId);
      const food = meal.foods.find((item) => item.name === foodName);
      if (!food) throw new PlanRuleError('not-found', FOOD_NOT_FOUND);
      const request: SubstituteRequest = {
        food: { name: food.name, grams: food.grams },
        slot: meal.slot,
        mealTitle: meal.title,
        time: meal.time,
        mealFoods: meal.foods
          .map((item) => item.name)
          .filter((name) => name !== foodName),
        restricted: Object.keys(planner.state.foodFeedback),
        diet: routine?.diet ?? 'onivora',
        exclude,
      };
      return { request, feedback: planner.state.foodFeedback };
    });
    const names = await this.composer.suggestSubstitutes(
      userId,
      request,
      feedback,
    );
    return this.read(userId, clock, (planner) => {
      const suggested = names
        ? planner.substitutes(mealId, foodName, names, exclude)
        : [];
      if (suggested.length > 0) return suggested;
      // A falha do assistente (erro, demora, nenhum nome no catálogo) já vai para o log dele.
      if (names)
        this.logger.warn(
          `Substitutos do assistente para "${foodName}" descartados (${names.join('; ')}); usando os do mesmo grupo.`,
        );
      return planner.substitutes(mealId, foodName, undefined, exclude);
    });
  }

  /** Estado do plano com lock da linha (cria a linha na primeira vez). */
  private lockState(manager: EntityManager, userId: string) {
    return lockPlanState(manager, userId);
  }

  /**
   * Abre o plano do usuário para leitura ou alteração. `change` devolve o novo estado (ou `null` se
   * não muda nada) e o que responder. Toda chamada atualiza a foto do dia.
   */
  private async withPlanner<T>(
    userId: string,
    { today }: UserClock,
    change: (planner: Planner) => {
      state: PlanState | null;
      result: (after: Planner) => T;
      flagged?: { name: string; feedback: FoodFeedback };
    },
  ): Promise<T> {
    const [catalog, profileOptions] = await Promise.all([
      this.catalog.catalog(),
      this.plannerOptions(userId),
    ]);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const entity = await this.lockState(manager, userId);
        const options: PlannerOptions = {
          ...profileOptions,
          personalization: personalizationStatus(entity),
        };
        const planner = new Planner(catalog, toPlanState(entity), options);
        const { state, result, flagged } = change(planner);
        let after = planner;
        if (state) {
          after = new Planner(catalog, state, options);
          await manager.save(
            Object.assign(entity, {
              mealTimes: state.mealTimes,
              planChanges: state.planChanges,
              foodFeedback: state.foodFeedback,
              foodSubstitutes: state.foodSubstitutes,
              mealFoodSwaps: state.mealFoodSwaps,
              nextExtraId: state.nextExtraId,
            }),
          );
        }
        await this.dayLogs.record(manager, userId, today, after.plan, flagged);
        await this.versions.record(
          manager,
          userId,
          today,
          after.plan,
          options.personalization ?? null,
        );
        return result(after);
      });
    } catch (error) {
      throw asHttpError(error);
    }
  }

  /**
   * O plano de hoje com o ajuste da dieta `settings`, sem salvar: mesmas mudanças do usuário, porções pelas
   * metas novas. Devolve os totais dos dois planos e o que muda.
   */
  async previewDiet(
    userId: string,
    clock: UserClock,
    settings: DietSettings,
  ): Promise<DietPreview> {
    const [catalog, next, micros] = await Promise.all([
      this.catalog.catalog(),
      this.plannerOptions(userId, settings),
      this.catalog.micros(),
    ]);
    const { before, after } = await this.read(userId, clock, (planner) => ({
      before: planner.plan,
      after: new Planner(catalog, planner.state, {
        ...next,
        personalization: planner.todayPlan().personalization,
      }).plan,
    }));
    const version = (meals: PlanMeal[]) =>
      planVersion(meals, planNutrients(meals, micros).fibras ?? 0);
    const current = version(before);
    const preview = version(after);
    return {
      current: current.totals,
      next: preview.totals,
      meals: preview.meals.map(({ slot, title, time, kcal, foods }) => ({
        slot,
        title,
        time,
        kcal,
        foods,
      })),
      changes: planChanges(current.meals, preview.meals),
    };
  }

  /** Lê sem alterar o estado. */
  read<T>(
    userId: string,
    clock: UserClock,
    read: (planner: Planner) => T,
  ): Promise<T> {
    return this.withPlanner(userId, clock, (planner) => {
      const value = read(planner);
      return { state: null, result: () => value };
    });
  }

  /**
   * Altera o estado e responde o plano de hoje atualizado. `flaggedFood`: alimento marcado nesta
   * alteração (entra na foto do dia com a marcação que ficou).
   */
  update(
    userId: string,
    clock: UserClock,
    change: (planner: Planner) => PlanState,
    flaggedFood?: string,
  ): Promise<TodayPlan> {
    return this.withPlanner(userId, clock, (planner) => {
      const state = change(planner);
      const feedback = flaggedFood
        ? state.foodFeedback[flaggedFood]
        : undefined;
      return {
        state,
        result: (after) => after.todayPlan(),
        flagged:
          flaggedFood && feedback ? { name: flaggedFood, feedback } : undefined,
      };
    });
  }
}
