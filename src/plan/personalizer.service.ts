import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, In, Not } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service.js';
import type { AvoidRule, DietSettings, Profile, Routine } from '../contract.js';
import {
  PlanStateEntity,
  SchedulePlanEntity,
} from '../database/entities/index.js';
import { dietSettingsOf } from '../targets/diet.js';
import { calculateTargets, macroTargets } from '../targets/targets.js';
import { type DayRoutine, dayRoutine, MEAL_SLOTS } from '../users/routine.js';
import { UsersService } from '../users/users.service.js';
import type { PersonalPlanRequest } from './composer/personal-plan.js';
import { MealComposerService } from './composer/meal-composer.service.js';
import { EMPTY_PLAN_CHANGES, type Catalog } from './engine/types.js';
import {
  lockSchedulePlan,
  personalizationStatus,
  PLAN_NOT_FOUND,
} from './plan.service.js';

/**
 * Plano individual: na primeira vez que a rotina é salva (e quando o usuário pede para refazer), o Claude monta
 * as refeições do plano base para o usuário, com os horários pela rotina, em segundo plano: um plano por grupo de
 * dias da rotina, um depois do outro. Enquanto isso o plano aparece com `personalization: 'pending'`; ao terminar,
 * as refeições dele entram no lugar (e as mudanças feitas no plano são zeradas, menos as restrições). Se falhar,
 * fica `failed` e o plano não muda.
 */
@Injectable()
export class PlanPersonalizerService implements OnApplicationShutdown {
  private readonly logger = new Logger(PlanPersonalizerService.name);
  /** Montagens em andamento (para os testes e o desligamento esperarem). */
  private readonly running = new Set<Promise<void>>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly users: UsersService,
    private readonly composer: MealComposerService,
  ) {}

  /**
   * Depois de salvar a rotina: os planos dos grupos que saíram são apagados; na primeira rotina, o assistente monta
   * todos os planos, e depois, só os dos grupos novos (os outros, só se o usuário pedir para refazer).
   */
  async routineChanged(
    userId: string,
    previous: Routine | null,
    routine: Routine,
  ): Promise<void> {
    const ids = routine.schedules.map((schedule) => schedule.id);
    await this.dataSource
      .getRepository(SchedulePlanEntity)
      .delete({ userId, scheduleId: Not(In(ids)) });
    const known = new Set(previous?.schedules.map((schedule) => schedule.id));
    const added = previous ? ids.filter((id) => !known.has(id)) : ids;
    if (added.length > 0) await this.start(userId, added);
  }

  /** Começa a montagem dos planos `scheduleIds` em segundo plano (sem o assistente configurado, fica o padrão). */
  async start(userId: string, scheduleIds: number[]): Promise<void> {
    if (!this.composer.available) return;
    await this.dataSource.transaction(async (manager) => {
      const plans = [];
      for (const id of scheduleIds)
        plans.push(await lockSchedulePlan(manager, userId, id));
      if (plans.some((plan) => personalizationStatus(plan) === 'pending'))
        throw new ConflictException('Seu plano já está sendo montado.');
      for (const plan of plans)
        await manager.save(
          Object.assign(plan, {
            personalization: 'pending',
            personalizationAt: new Date(),
          }),
        );
    });
    const job = this.run(userId, scheduleIds).finally(() =>
      this.running.delete(job),
    );
    this.running.add(job);
  }

  /**
   * `POST /plan/personalize`: monta de novo (depois de uma falha ou de mudar a rotina) o plano `planId`; sem ele,
   * todos os planos.
   */
  async retry(userId: string, planId?: number): Promise<void> {
    if (!this.composer.available)
      throw new ServiceUnavailableException(
        'O assistente está indisponível agora. Tente de novo em instantes.',
      );
    const { profile, routine } = await this.users.get(userId);
    if (!profile || !routine)
      throw new ConflictException(
        'Preencha o perfil e a rotina para montar o plano.',
      );
    const ids = routine.schedules.map((schedule) => schedule.id);
    if (planId !== undefined && !ids.includes(planId))
      throw new NotFoundException(PLAN_NOT_FOUND);
    await this.start(userId, planId === undefined ? ids : [planId]);
  }

  /** Espera as montagens em andamento terminarem. */
  async whenIdle(): Promise<void> {
    while (this.running.size > 0) await Promise.all(this.running);
  }

  async onApplicationShutdown() {
    await this.whenIdle();
  }

  private async run(userId: string, scheduleIds: number[]): Promise<void> {
    for (const scheduleId of scheduleIds) await this.runOne(userId, scheduleId);
  }

  private async runOne(userId: string, scheduleId: number): Promise<void> {
    let meals = null;
    try {
      const [
        { profile, routine, dietSettings, calorieGoal, weightGoal },
        catalog,
        state,
      ] = await Promise.all([
        this.users.get(userId),
        this.catalog.catalog(),
        this.dataSource.getRepository(PlanStateEntity).findOneBy({ userId }),
      ]);
      const schedule = routine?.schedules.find(
        (item) => item.id === scheduleId,
      );
      const feedback = state?.foodFeedback ?? {};
      if (profile && routine && schedule) {
        meals = await this.composer.composePersonalPlan(
          userId,
          personalPlanRequest(
            // O objetivo de agora (o último peso meta pode ter virado o do cadastro).
            { ...profile, goal: weightGoal ?? profile.goal },
            dayRoutine(routine, schedule),
            catalog,
            Object.keys(feedback),
            dietSettings,
            calorieGoal,
            state?.foodAvoid ?? [],
          ),
          feedback,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Plano individual: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      await this.dataSource.transaction(async (manager) => {
        const entity = await lockSchedulePlan(manager, userId, scheduleId);
        await manager.save(
          Object.assign(
            entity,
            meals
              ? {
                  personalMeals: meals,
                  personalization: 'ready',
                  // O plano novo começa limpo; restrições e trocas gerais ficam.
                  planChanges: EMPTY_PLAN_CHANGES,
                  mealTimes: {},
                  mealFoodSwaps: {},
                }
              : { personalization: 'failed' },
          ),
        );
      });
    } catch (error) {
      this.logger.warn(
        `Plano individual (gravar): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * O que o assistente precisa para montar o plano: perfil, metas do dia (com o ajuste da dieta), a rotina do grupo de dias (com o tipo de alimentação),
 * as refeições do plano base que o usuário faz (na ordem do dia) e os alimentos restritos.
 */
export function personalPlanRequest(
  profile: Profile,
  routine: DayRoutine,
  catalog: Catalog,
  restricted: string[],
  dietSettings: DietSettings | null = null,
  calorieGoal: number | null = null,
  avoid: AvoidRule[] = [],
): PersonalPlanRequest {
  const { calories } = calculateTargets(profile, calorieGoal);
  const goals = macroTargets(
    profile,
    dietSettingsOf(dietSettings),
    calorieGoal,
  );
  return {
    profile: {
      sex: profile.sex,
      age: profile.age,
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
    },
    day: {
      kcal: calories,
      protein: goals.proteinas,
      fat: goals.gorduras,
      carbs: goals.carboidratos,
    },
    meals: MEAL_SLOTS.filter((slot) => routine.meals.includes(slot)).flatMap(
      (slot) =>
        catalog.baseMeals
          .filter((meal) => meal.slot === slot)
          .map(({ id }) => ({ id, slot })),
    ),
    routine,
    restricted,
    avoid,
  };
}
