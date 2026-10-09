import {
  ConflictException,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service.js';
import type { Profile } from '../contract.js';
import { PlanStateEntity } from '../database/entities/index.js';
import { calculateTargets, macroTargets } from '../targets/targets.js';
import { UsersService } from '../users/users.service.js';
import type { PersonalPlanRequest } from './composer/personal-plan.js';
import { MealComposerService } from './composer/meal-composer.service.js';
import { Planner } from './engine/planner.js';
import {
  EMPTY_DAY_PLAN,
  EMPTY_PLAN_CHANGES,
  type Catalog,
} from './engine/types.js';
import { lockPlanState, personalizationStatus } from './plan.service.js';

/**
 * Plano individual: na primeira vez que o perfil é salvo, o Claude monta as refeições do plano base para o
 * usuário, em segundo plano. Enquanto isso o plano padrão aparece com `personalization: 'pending'`; ao terminar,
 * as refeições dele entram no lugar (e as mudanças feitas no plano nesse meio-tempo são zeradas, menos as
 * restrições). Se falhar, fica `failed` e o usuário pode tentar de novo.
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

  /** Começa a montagem em segundo plano (sem o assistente configurado, fica o plano padrão). */
  async start(userId: string): Promise<void> {
    if (!this.composer.available) return;
    await this.dataSource.transaction(async (manager) => {
      const entity = await lockPlanState(manager, userId);
      if (personalizationStatus(entity) === 'pending')
        throw new ConflictException('Seu plano já está sendo montado.');
      await manager.save(
        Object.assign(entity, {
          personalization: 'pending',
          personalizationAt: new Date(),
        }),
      );
    });
    const job = this.run(userId).finally(() => this.running.delete(job));
    this.running.add(job);
  }

  /** `POST /plan/personalize`: tenta de novo, só depois de uma falha. */
  async retry(userId: string): Promise<void> {
    const entity = await this.dataSource
      .getRepository(PlanStateEntity)
      .findOneBy({ userId });
    if (!entity || personalizationStatus(entity) !== 'failed')
      throw new ConflictException(
        'Só dá para tentar de novo quando a montagem do plano falhou.',
      );
    await this.start(userId);
  }

  /** Espera as montagens em andamento terminarem. */
  async whenIdle(): Promise<void> {
    while (this.running.size > 0) await Promise.all(this.running);
  }

  async onApplicationShutdown() {
    await this.whenIdle();
  }

  private async run(userId: string): Promise<void> {
    let meals = null;
    try {
      const [{ profile }, catalog, state] = await Promise.all([
        this.users.get(userId),
        this.catalog.catalog(),
        this.dataSource
          .getRepository(PlanStateEntity)
          .findOneByOrFail({ userId }),
      ]);
      if (profile) {
        meals = await this.composer.composePersonalPlan(
          personalPlanRequest(
            profile,
            catalog,
            Object.keys(state.foodFeedback),
          ),
          state.foodFeedback,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Plano individual: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      await this.dataSource.transaction(async (manager) => {
        const entity = await lockPlanState(manager, userId);
        await manager.save(
          Object.assign(
            entity,
            meals
              ? {
                  personalMeals: meals,
                  personalization: 'ready',
                  // O plano novo começa limpo; restrições e trocas gerais ficam.
                  planChanges: EMPTY_PLAN_CHANGES,
                  dayPlan: null,
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
 * O que o assistente precisa para montar o plano: perfil, metas do dia e de cada refeição do plano base que
 * entra pelas refeições por dia (cada uma com a fatia de calorias que tem no plano padrão), tipo de
 * alimentação, preferências e alimentos restritos.
 */
export function personalPlanRequest(
  profile: Profile,
  catalog: Catalog,
  restricted: string[],
): PersonalPlanRequest {
  const { calories } = calculateTargets(profile);
  const goals = macroTargets(profile);
  const day = {
    kcal: calories,
    protein: goals.proteinas,
    fat: goals.gorduras,
    carbs: goals.carboidratos,
  };
  const planner = new Planner(
    catalog,
    {
      mealTimes: {},
      planChanges: EMPTY_PLAN_CHANGES,
      dayPlan: EMPTY_DAY_PLAN,
      foodFeedback: {},
      foodSubstitutes: {},
      mealFoodSwaps: {},
      nextExtraId: 1,
    },
    { calorieGoal: calories, mealsPerDay: profile.mealsPerDay },
  );
  const dayKcal = planner.dayKcal() || 1;
  const share = (value: number, kcal: number) =>
    Math.round((value * kcal) / dayKcal);
  return {
    profile: {
      sex: profile.sex,
      age: profile.age,
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
    },
    day,
    meals: planner.plan.map(({ id, time, totals: { kcal } }) => ({
      id,
      time,
      kcal: share(calories, kcal),
      protein: share(day.protein, kcal),
      fat: share(day.fat, kcal),
      carbs: share(day.carbs, kcal),
    })),
    diet: profile.diet,
    restricted,
  };
}
