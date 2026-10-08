import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service.js';
import type { UserClock } from '../common/timezone.js';
import type {
  CreateMealPreview,
  FoodFeedback,
  PlanFood,
  TodayPlan,
} from '../contract.js';
import { PlanStateEntity } from '../database/entities/index.js';
import { DayLogService } from './day-log.service.js';
import { FOOD_NOT_FOUND, Planner, PlanRuleError } from './engine/planner.js';
import {
  DEFAULT_PLANNER_OPTIONS,
  EMPTY_DAY_PLAN,
  EMPTY_PLAN_CHANGES,
  type PlannerOptions,
  type PlanState,
} from './engine/types.js';
import { calculateTargets, macroTargets } from '../targets/targets.js';
import type { CompositionRequest } from './composer/composition.js';
import type { SubstituteRequest } from './composer/substitution.js';
import { MealComposerService } from './composer/meal-composer.service.js';
import { UsersService } from '../users/users.service.js';

function toPlanState(entity: PlanStateEntity, today: string): PlanState {
  return {
    mealTimes: entity.mealTimes,
    // Mescla com o vazio: estados salvos antes de um campo existir continuam válidos.
    planChanges: { ...EMPTY_PLAN_CHANGES, ...entity.planChanges },
    // As mudanças "só de hoje" de outro dia são descartadas.
    dayPlan:
      entity.dayPlan?.date === today
        ? { ...EMPTY_DAY_PLAN, ...entity.dayPlan.changes }
        : EMPTY_DAY_PLAN,
    foodFeedback: entity.foodFeedback,
    foodSubstitutes: entity.foodSubstitutes,
    mealFoodSwaps: entity.mealFoodSwaps,
    nextExtraId: entity.nextExtraId,
  };
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
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly dayLogs: DayLogService,
    private readonly users: UsersService,
    private readonly composer: MealComposerService,
  ) {}

  /** Meta calórica e refeições por dia do perfil (sem perfil: porções originais, 3 refeições). */
  private async plannerOptions(userId: string): Promise<PlannerOptions> {
    const { profile } = await this.users.get(userId);
    const composerAvailable = this.composer.available;
    if (!profile) return { ...DEFAULT_PLANNER_OPTIONS, composerAvailable };
    return {
      calorieGoal: calculateTargets(profile).calories,
      mealsPerDay: profile.mealsPerDay,
      composerAvailable,
    };
  }

  /** O que o assistente precisa para compor a refeição nova: metas dela, restrições e o plano de hoje. */
  private async compositionRequest(
    userId: string,
    clock: UserClock,
    title: string,
    time: string,
  ) {
    const { profile } = await this.users.get(userId);
    const goals = profile ? macroTargets(profile) : null;
    return this.read(userId, clock, (planner) => {
      const { kcal, macros } = planner.newMealTargets(
        goals
          ? {
              protein: goals.proteinas,
              fat: goals.gorduras,
              carbs: goals.carboidratos,
            }
          : null,
      );
      const request: CompositionRequest = {
        title,
        time,
        kcal,
        macros,
        restricted: Object.keys(planner.state.foodFeedback),
        otherMeals: planner.plan.map((meal) => ({
          title: meal.title,
          foods: meal.foods.map((food) => food.name),
        })),
      };
      return { request, feedback: planner.state.foodFeedback };
    });
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
  ): Promise<PlanFood[]> {
    const { request, feedback } = await this.read(userId, clock, (planner) => {
      const meal = planner.meal(mealId);
      const food = meal.foods.find((item) => item.name === foodName);
      if (!food) throw new PlanRuleError('not-found', FOOD_NOT_FOUND);
      const request: SubstituteRequest = {
        food: { name: food.name, grams: food.grams },
        mealTitle: meal.title,
        time: meal.time,
        mealFoods: meal.foods
          .map((item) => item.name)
          .filter((name) => name !== foodName),
        restricted: Object.keys(planner.state.foodFeedback),
      };
      return { request, feedback: planner.state.foodFeedback };
    });
    const names = await this.composer.suggestSubstitutes(request, feedback);
    return this.read(userId, clock, (planner) => {
      const suggested = names
        ? planner.substitutes(mealId, foodName, names)
        : [];
      return suggested.length > 0
        ? suggested
        : planner.substitutes(mealId, foodName);
    });
  }

  /**
   * Prévia de uma refeição nova, com os alimentos compostos pelo assistente (ou da lista fixa, se ele não
   * estiver disponível). A chamada ao assistente fica fora da transação do plano.
   */
  async previewMeal(
    userId: string,
    clock: UserClock,
    title: string,
    time: string,
  ): Promise<CreateMealPreview> {
    const { request, feedback } = await this.compositionRequest(
      userId,
      clock,
      title,
      time,
    );
    const composed =
      (await this.composer.composeForPreview(userId, request, feedback)) ??
      undefined;
    return this.read(userId, clock, (planner) =>
      planner.previewNewMeal(title, time, composed),
    );
  }

  /** Cria a refeição com a mesma sugestão da prévia (ou compõe uma, se não houve prévia). */
  async createMeal(
    userId: string,
    clock: UserClock,
    title: string,
    time: string,
  ): Promise<TodayPlan> {
    const { request, feedback } = await this.compositionRequest(
      userId,
      clock,
      title,
      time,
    );
    const composed =
      (await this.composer.composeForCreate(userId, request, feedback)) ??
      undefined;
    return this.update(userId, clock, (planner) =>
      planner.createMeal(title, time, composed),
    );
  }

  /** Estado do plano com lock da linha (cria a linha na primeira vez). */
  private async lockState(manager: EntityManager, userId: string) {
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
    const [catalog, options] = await Promise.all([
      this.catalog.catalog(),
      this.plannerOptions(userId),
    ]);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const entity = await this.lockState(manager, userId);
        const planner = new Planner(
          catalog,
          toPlanState(entity, today),
          options,
        );
        const { state, result, flagged } = change(planner);
        let after = planner;
        if (state) {
          after = new Planner(catalog, state, options);
          await manager.save(
            Object.assign(entity, {
              mealTimes: state.mealTimes,
              planChanges: state.planChanges,
              dayPlan: { date: today, changes: state.dayPlan },
              foodFeedback: state.foodFeedback,
              foodSubstitutes: state.foodSubstitutes,
              mealFoodSwaps: state.mealFoodSwaps,
              nextExtraId: state.nextExtraId,
            }),
          );
        }
        await this.dayLogs.record(manager, userId, today, after.plan, flagged);
        return result(after);
      });
    } catch (error) {
      throw asHttpError(error);
    }
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
