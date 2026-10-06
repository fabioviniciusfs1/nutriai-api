import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service.js';
import type { FoodFeedback, PlanMeal } from '../contract.js';
import { DayLogEntity } from '../database/entities/index.js';
import { planNutrients } from './nutrients.js';

/** Grava a foto do plano do dia, base do histórico e dos nutrientes de hoje. */
@Injectable()
export class DayLogService {
  constructor(private readonly catalog: CatalogService) {}

  async record(
    manager: EntityManager,
    userId: string,
    date: string,
    meals: PlanMeal[],
    flagged?: { name: string; feedback: FoodFeedback },
  ) {
    const existing = await manager.findOneBy(DayLogEntity, { userId, date });
    const flaggedFoods = (existing?.flaggedFoods ?? []).filter(
      (food) => food.name !== flagged?.name,
    );
    if (flagged) flaggedFoods.push(flagged);
    await manager.upsert(
      DayLogEntity,
      {
        userId,
        date,
        meals: meals.map(({ time, title, totals }) => ({
          time,
          title,
          kcal: totals.kcal,
        })),
        consumedKcal: meals.reduce((sum, meal) => sum + meal.totals.kcal, 0),
        nutrients: planNutrients(meals, await this.catalog.micros()),
        flaggedFoods,
      },
      ['userId', 'date'],
    );
  }
}
