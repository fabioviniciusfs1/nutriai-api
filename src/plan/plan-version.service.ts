import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service.js';
import type { Personalization, PlanMeal } from '../contract.js';
import { PlanVersionEntity } from '../database/entities/index.js';
import { planNutrients } from './nutrients.js';
import { appendEdits, nextPlanVersion, planVersion } from './plan-versions.js';

/** Grava as versões do plano (base de `/history/plans`): uma por montagem, com as mudanças do usuário nela. */
@Injectable()
export class PlanVersionService {
  constructor(private readonly catalog: CatalogService) {}

  async record(
    manager: EntityManager,
    userId: string,
    today: string,
    meals: PlanMeal[],
    personalization: Personalization,
    personalizationAt: Date | null,
  ) {
    // Enquanto o assistente monta, o plano é o base: a primeira versão tem de ser a dele.
    if (personalization === 'pending') return;
    const fiber = planNutrients(meals, await this.catalog.micros()).fibras ?? 0;
    const version = planVersion(meals, fiber);
    const last = await manager.findOne(PlanVersionEntity, {
      where: { userId },
      order: { id: 'DESC' },
    });
    const assembledAt = personalization === 'ready' ? personalizationAt : null;
    const action = nextPlanVersion(last, version.fingerprint, assembledAt);
    if (action === 'insert')
      await manager.insert(PlanVersionEntity, {
        userId,
        date: today,
        edited: false,
        assembledAt,
        ...version,
        changes: [],
      });
    else if (action === 'replace')
      // A primeira montagem do assistente fica no lugar do plano base.
      await manager.save(
        Object.assign(last!, {
          date: today,
          assembledAt,
          ...version,
          changes: [],
        }),
      );
    else if (action === 'update')
      // Cada mudança entra nas alterações do plano com o dia e o horário dela.
      await manager.save(
        Object.assign(last!, {
          ...version,
          changes: appendEdits(
            last!.meals,
            version.meals,
            today,
            new Date().toISOString(),
            last!.changes ?? [],
          ),
        }),
      );
  }
}
