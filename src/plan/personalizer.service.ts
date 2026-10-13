import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service.js';
import type { Profile, Routine } from '../contract.js';
import { PlanStateEntity } from '../database/entities/index.js';
import { calculateTargets, macroTargets } from '../targets/targets.js';
import { MEAL_SLOTS } from '../users/routine.js';
import { UsersService } from '../users/users.service.js';
import type { PersonalPlanRequest } from './composer/personal-plan.js';
import { MealComposerService } from './composer/meal-composer.service.js';
import { EMPTY_PLAN_CHANGES, type Catalog } from './engine/types.js';
import { lockPlanState, personalizationStatus } from './plan.service.js';

/**
 * Plano individual: na primeira vez que a rotina é salva (e quando o usuário pede para refazer), o Claude monta
 * as refeições do plano base para o usuário, com os horários pela rotina, em segundo plano. Enquanto isso o
 * plano atual aparece com `personalization: 'pending'`; ao terminar, as refeições dele entram no lugar (e as
 * mudanças feitas no plano são zeradas, menos as restrições). Se falhar, fica `failed` e o plano não muda.
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

  /** `POST /plan/personalize`: monta de novo (depois de uma falha ou de mudar a rotina). */
  async retry(userId: string): Promise<void> {
    if (!this.composer.available)
      throw new ServiceUnavailableException(
        'O assistente está indisponível agora. Tente de novo em instantes.',
      );
    const { profile, routine } = await this.users.get(userId);
    if (!profile || !routine)
      throw new ConflictException(
        'Preencha o perfil e a rotina para montar o plano.',
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
      const [{ profile, routine }, catalog, state] = await Promise.all([
        this.users.get(userId),
        this.catalog.catalog(),
        this.dataSource
          .getRepository(PlanStateEntity)
          .findOneByOrFail({ userId }),
      ]);
      if (profile && routine) {
        meals = await this.composer.composePersonalPlan(
          personalPlanRequest(
            profile,
            routine,
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
 * O que o assistente precisa para montar o plano: perfil, metas do dia, a rotina (com o tipo de alimentação),
 * as refeições do plano base que o usuário faz (na ordem do dia) e os alimentos restritos.
 */
export function personalPlanRequest(
  profile: Profile,
  routine: Routine,
  catalog: Catalog,
  restricted: string[],
): PersonalPlanRequest {
  const { calories } = calculateTargets(profile);
  const goals = macroTargets(profile);
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
  };
}
