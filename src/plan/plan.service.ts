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
  Routine,
  RoutineSchedule,
  TodayPlan,
} from '../contract.js';
import {
  PlanStateEntity,
  SchedulePlanEntity,
  type UserEntity,
} from '../database/entities/index.js';
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
import { dayRoutine, MAIN_MEALS, scheduleOn, WEEK } from '../users/routine.js';

export const PLAN_NOT_FOUND = 'Plano não encontrado.';
export const TODAY_ONLY = 'Só dá para acrescentar alimento no plano de hoje.';

/** Sem rotina: um grupo só, com todos os dias e as refeições principais. */
const DEFAULT_SCHEDULE: RoutineSchedule = {
  id: 1,
  days: WEEK,
  eatingWindows: [],
  wakeTime: '07:00',
  sleepTime: '23:00',
  trainingStart: null,
  trainingEnd: null,
  meals: MAIN_MEALS,
};

/** Os grupos de dias da rotina (sem rotina, o padrão). */
export function schedulesOf(routine: Routine | null): RoutineSchedule[] {
  return routine?.schedules ?? [DEFAULT_SCHEDULE];
}

/** O estado do plano: o que vale para o usuário inteiro junto com o que é do plano do grupo. */
function toPlanState(
  user: PlanStateEntity,
  plan: SchedulePlanEntity,
): PlanState {
  return {
    mealTimes: plan.mealTimes,
    // Mescla com o vazio: estados salvos antes de um campo existir continuam válidos.
    planChanges: { ...EMPTY_PLAN_CHANGES, ...plan.planChanges },
    foodFeedback: user.foodFeedback,
    foodSubstitutes: user.foodSubstitutes,
    mealFoodSwaps: plan.mealFoodSwaps,
    nextExtraId: plan.nextExtraId,
    personalMeals: plan.personalMeals,
  };
}

/**
 * Uma montagem `pending` mais velha que isso é tratada como falha (ex.: a API reiniciou no meio). Maior que o
 * tempo máximo da chamada ao Claude (2 min, com uma nova tentativa).
 */
const PERSONALIZATION_TIMEOUT_MS = 5 * 60 * 1000;

/** Estado da montagem do plano individual, com `pending` antiga virando `failed`. */
export function personalizationStatus(
  entity: Pick<SchedulePlanEntity, 'personalization' | 'personalizationAt'>,
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

/** Restrições e trocas gerais do usuário (linha criada vazia se não existir), travadas até o fim da transação. */
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

/** Plano do grupo de dias `scheduleId` (linha criada vazia se não existir), travado até o fim da transação. */
export async function lockSchedulePlan(
  manager: EntityManager,
  userId: string,
  scheduleId: number,
) {
  await manager
    .createQueryBuilder()
    .insert()
    .into(SchedulePlanEntity)
    .values({ userId, scheduleId })
    .orIgnore()
    .execute();
  return manager.findOneOrFail(SchedulePlanEntity, {
    where: { userId, scheduleId },
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
   * Metas de calorias e macronutrientes do perfil (com o ajuste da dieta), peso da unidade do ovo, refeições do
   * grupo de dias e tipo de alimentação da rotina (sem perfil: porções originais; sem rotina: café da manhã, almoço
   * e jantar, sem restrição).
   */
  private plannerOptions(
    { profile, routine, dietSettings, calorieGoal }: UserEntity,
    schedule: RoutineSchedule,
    settings?: DietSettings,
  ): PlannerOptions {
    const diet = settings ?? dietSettingsOf(dietSettings);
    const macros = profile ? macroTargets(profile, diet, calorieGoal) : null;
    return {
      calorieGoal: profile
        ? calculateTargets(profile, calorieGoal).calories
        : null,
      macroGoals: macros && {
        protein: macros.proteinas,
        fat: macros.gorduras,
        carbs: macros.carboidratos,
      },
      eggUnitGrams: diet.eggUnitGrams,
      meals: routine ? schedule.meals : DEFAULT_PLANNER_OPTIONS.meals,
      diet: routine?.diet,
    };
  }

  /** O grupo de dias do plano `planId` (sem ele, o de hoje); erro 404 se não existir. */
  private scheduleOf(
    routine: Routine | null,
    today: string,
    planId?: number,
  ): RoutineSchedule {
    if (planId === undefined)
      return routine ? scheduleOn(routine, today) : DEFAULT_SCHEDULE;
    const schedule = schedulesOf(routine).find((item) => item.id === planId);
    if (!schedule) throw new NotFoundException(PLAN_NOT_FOUND);
    return schedule;
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
    planId?: number,
  ): Promise<MealTimeCheck> {
    const ok: MealTimeCheck = {
      ok: true,
      message: null,
      suggestedTime: null,
      canKeep: true,
    };
    const [meals, { profile, routine }] = await Promise.all([
      this.read(
        userId,
        clock,
        (planner) => {
          planner.meal(mealId);
          return planner.plan.map(({ id, slot, title, time, totals }) => ({
            id,
            slot,
            title,
            time,
            kcal: totals.kcal,
          }));
        },
        planId,
      ),
      this.users.get(userId),
    ]);
    const current = meals.find((meal) => meal.id === mealId)!;
    if (current.time === time) return ok;
    const schedule = this.scheduleOf(routine, clock.today, planId);
    const request = {
      profile,
      routine: routine && dayRoutine(routine, schedule),
      meals,
      mealId,
      time,
    };
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
    planId?: number,
  ): Promise<PlanFood[]> {
    const { routine } = await this.users.get(userId);
    const { request, feedback } = await this.read(
      userId,
      clock,
      (planner) => {
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
      },
      planId,
    );
    const names = await this.composer.suggestSubstitutes(
      userId,
      request,
      feedback,
    );
    return this.read(
      userId,
      clock,
      (planner) => {
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
      },
      planId,
    );
  }

  /** Página Alimentos: os restritos, com os substitutos de "Não quero" de todos os planos. */
  async restrictedFoods(userId: string, clock: UserClock) {
    const plans = await this.dataSource
      .getRepository(SchedulePlanEntity)
      .findBy({ userId });
    return this.read(userId, clock, (planner) =>
      planner.restrictedFoods(plans.map((plan) => plan.mealFoodSwaps)),
    );
  }

  /**
   * Abre o plano `planId` do usuário (sem ele, o do grupo de dias de hoje) para leitura ou alteração. `change`
   * devolve o novo estado (ou `null` se não muda nada) e o que responder. Toda chamada atualiza a versão do plano
   * e, no plano de hoje, a foto do dia.
   */
  private async withPlanner<T>(
    userId: string,
    { today }: UserClock,
    change: (planner: Planner) => {
      state: PlanState | null;
      result: (after: Planner) => T;
      flagged?: { name: string; feedback: FoodFeedback };
    },
    { planId, todayOnly = false, settings, dryRun = false }: PlanTarget = {},
  ): Promise<T> {
    const [catalog, user] = await Promise.all([
      this.catalog.catalog(),
      this.users.get(userId),
    ]);
    const schedule = this.scheduleOf(user.routine, today, planId);
    const active = this.scheduleOf(user.routine, today).id === schedule.id;
    if (todayOnly && !active) throw new BadRequestException(TODAY_ONLY);
    const profileOptions = this.plannerOptions(user, schedule, settings);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const userState = await lockPlanState(manager, userId);
        const entity = await lockSchedulePlan(manager, userId, schedule.id);
        const others = await manager.findBy(SchedulePlanEntity, { userId });
        const options: PlannerOptions = {
          ...profileOptions,
          personalization: personalizationStatus(entity),
          today,
          plans: {
            plan: { id: schedule.id, days: schedule.days, active },
            plans: schedulesOf(user.routine).map(({ id, days }) => {
              const plan = others.find((item) => item.scheduleId === id);
              return {
                id,
                days,
                active: this.scheduleOf(user.routine, today).id === id,
                personalization:
                  id === schedule.id
                    ? personalizationStatus(entity)
                    : plan
                      ? personalizationStatus(plan)
                      : null,
              };
            }),
          },
        };
        const planner = new Planner(
          catalog,
          toPlanState(userState, entity),
          options,
        );
        const changed = change(planner);
        const { result, flagged } = changed;
        // Sem ação do usuário, o estado ainda muda quando um alimento extra de outro dia sai.
        const state = changed.state ?? (planner.expired ? planner.state : null);
        if (dryRun) return result(planner);
        let after = planner;
        if (state) {
          after = new Planner(catalog, state, options);
          await manager.save(
            Object.assign(userState, {
              foodFeedback: state.foodFeedback,
              foodSubstitutes: state.foodSubstitutes,
            }),
          );
          await manager.save(
            Object.assign(entity, {
              mealTimes: state.mealTimes,
              planChanges: state.planChanges,
              mealFoodSwaps: state.mealFoodSwaps,
              nextExtraId: state.nextExtraId,
            }),
          );
        }
        // A foto do dia é a do plano de hoje.
        if (active)
          await this.dayLogs.record(
            manager,
            userId,
            today,
            after.plan,
            flagged,
          );
        await this.versions.record(
          manager,
          userId,
          schedule.id,
          today,
          after.plan,
          options.personalization ?? null,
          entity.personalizationAt,
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
    const micros = await this.catalog.micros();
    const before = await this.read(userId, clock, (planner) => planner.plan);
    // O mesmo plano com as metas novas: só lê (o `change` não devolve estado), então nada é salvo.
    const after = await this.withPlanner(
      userId,
      clock,
      (planner) => ({ state: null, result: () => planner.plan }),
      { settings, dryRun: true },
    );
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
    planId?: number,
  ): Promise<T> {
    return this.withPlanner(
      userId,
      clock,
      (planner) => {
        const value = read(planner);
        return { state: null, result: () => value };
      },
      { planId },
    );
  }

  /**
   * Altera o estado e responde o plano atualizado. `flaggedFood`: alimento marcado nesta alteração (entra na foto
   * do dia com a marcação que ficou). `todayOnly`: só no plano de hoje (o alimento extra).
   */
  update(
    userId: string,
    clock: UserClock,
    change: (planner: Planner) => PlanState,
    { flaggedFood, ...target }: PlanTarget & { flaggedFood?: string } = {},
  ): Promise<TodayPlan> {
    return this.withPlanner(
      userId,
      clock,
      (planner) => {
        const state = change(planner);
        const feedback = flaggedFood
          ? state.foodFeedback[flaggedFood]
          : undefined;
        return {
          state,
          result: (after) => after.todayPlan(),
          flagged:
            flaggedFood && feedback
              ? { name: flaggedFood, feedback }
              : undefined,
        };
      },
      target,
    );
  }
}

/** Qual plano abrir: `planId` (sem ele, o de hoje); `todayOnly` recusa outro plano. */
type PlanTarget = {
  planId?: number;
  todayOnly?: boolean;
  /** Ajuste da dieta no lugar do salvo (prévia). */
  settings?: DietSettings;
  /** Só lê: não grava a foto do dia nem a versão (prévia com outras metas). */
  dryRun?: boolean;
};
