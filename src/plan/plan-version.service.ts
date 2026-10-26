import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service.js';
import type { Personalization, PlanMeal } from '../contract.js';
import { PlanVersionEntity } from '../database/entities/index.js';
import { planNutrients } from './nutrients.js';
import { nextPlanVersion, planVersion } from './plan-versions.js';

/** Grava as versões do plano (base de `/history/plans`): a montada e uma alterada por dia. */
@Injectable()
export class PlanVersionService {
  constructor(private readonly catalog: CatalogService) {}

  async record(
    manager: EntityManager,
    userId: string,
    today: string,
    meals: PlanMeal[],
    personalization: Personalization,
  ) {
    // Enquanto o assistente monta, o plano é o base: a primeira versão tem de ser a dele.
    if (personalization === 'pending') return;
    const fiber = planNutrients(meals, await this.catalog.micros()).fibras ?? 0;
    const version = planVersion(meals, fiber);
    const [last, previous] = await manager.find(PlanVersionEntity, {
      where: { userId },
      order: { id: 'DESC' },
      take: 2,
    });
    const action = nextPlanVersion(
      last ?? null,
      previous ?? null,
      version.fingerprint,
      today,
    );
    if (action === 'insert')
      await manager.insert(PlanVersionEntity, {
        userId,
        date: today,
        edited: last !== undefined,
        ...version,
      });
    else if (action === 'update')
      await manager.save(Object.assign(last, version));
    else if (action === 'delete') await manager.remove(last);
  }
}
