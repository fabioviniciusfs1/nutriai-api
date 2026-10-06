import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service.js';
import type { UserClock } from '../common/timezone.js';
import type {
  MacroId,
  Nutrient,
  NutrientGroup,
  NutritionToday,
} from '../contract.js';
import { ActivityDayEntity } from '../database/entities/index.js';
import { HealthService } from '../health/health.service.js';
import { planNutrients } from '../plan/nutrients.js';
import { PlanService } from '../plan/plan.service.js';
import { perKg } from '../targets/targets.js';
import { UsersService } from '../users/users.service.js';
import { displayValue, nutrientGoal } from './nutrient-goals.js';

@Injectable()
export class NutritionService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly plan: PlanService,
    private readonly users: UsersService,
    private readonly health: HealthService,
    @InjectRepository(ActivityDayEntity)
    private readonly activityDays: Repository<ActivityDayEntity>,
  ) {}

  /** Consumo de hoje = o plano do dia como está; gasto = atividade do Google, se houver. */
  async today(userId: string, clock: UserClock): Promise<NutritionToday> {
    await this.health.syncIfStale(userId, clock);
    const [user, meals, defs, micros, activity] = await Promise.all([
      this.users.get(userId),
      this.plan.read(userId, clock, (planner) => planner.todayPlan().meals),
      this.catalog.nutrientDefs(),
      this.catalog.micros(),
      this.activityDays.findOneBy({ userId, date: clock.today }),
    ]);
    const consumed = planNutrients(meals, micros);

    const section = (name: string): Nutrient[] =>
      defs
        .filter((def) => def.section === name)
        .map((def) => {
          const meta = nutrientGoal(def, user.profile);
          return {
            id: def.id,
            name: def.name,
            atual: displayValue(consumed[def.id] ?? 0, meta),
            meta,
            unit: def.unit,
            ...(def.limit ? { limit: true } : {}),
          };
        });

    return {
      consumedKcal: meals.reduce((sum, meal) => sum + meal.totals.kcal, 0),
      burnedKcal: activity?.burned ?? null,
      macros: section('macros').map((macro) => ({
        ...(macro as Nutrient & { id: MacroId }),
        perKg: user.profile
          ? {
              atual: perKg(macro.atual, user.profile.weightKg),
              meta: perKg(macro.meta, user.profile.weightKg),
            }
          : null,
      })),
      fibers: section('fibers'),
      otherMacros: section('otherMacros'),
      vitamins: section('vitamins'),
      minerals: section('minerals'),
    };
  }

  /** Grupos do seletor do gráfico de nutrientes do histórico. */
  async groups(): Promise<NutrientGroup[]> {
    const groups = new Map<string, NutrientGroup>();
    for (const def of await this.catalog.nutrientDefs()) {
      let group = groups.get(def.groupName);
      if (!group) {
        group = { name: def.groupName, nutrients: [] };
        groups.set(def.groupName, group);
      }
      group.nutrients.push({
        id: def.id,
        name: def.name,
        unit: def.unit,
        ...(def.limit ? { limit: true } : {}),
      });
    }
    return [...groups.values()];
  }
}
