import { Column, Entity, PrimaryColumn, VersionColumn } from 'typeorm';
import type { Personalization } from '../../contract.js';
import type { PersonalMeals, PlanChanges } from '../../plan/engine/types.js';

/**
 * Plano de um grupo de dias da rotina (`RoutineSchedule.id`): as refeições montadas pelo assistente e as mudanças
 * do usuário nele (espelha o que o front antigo guardava em `reference/auth.ts`). Permanentes até o usuário
 * desfazer.
 */
@Entity('schedule_plans')
export class SchedulePlanEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @PrimaryColumn('int', { name: 'schedule_id' })
  scheduleId: number;

  /** Horário escolhido para cada refeição do plano base (id → "HH:MM"). */
  @Column('jsonb', { name: 'meal_times', default: {} })
  mealTimes: Record<number, string>;

  @Column('jsonb', {
    name: 'plan_changes',
    default: { extraFoods: {}, scales: {} },
  })
  planChanges: PlanChanges;

  /** Trocas de "Não quero" só numa refeição (id → nome → substituto; "" = sem substituto). */
  @Column('jsonb', { name: 'meal_food_swaps', default: {} })
  mealFoodSwaps: Record<number, Record<string, string>>;

  /** Próximo número de `extraId` (`x-<n>`) dos alimentos acrescentados. */
  @Column('int', { name: 'next_extra_id', default: 1 })
  nextExtraId: number;

  /** Refeições do plano base montadas pelo assistente para o usuário (id da refeição base → título e alimentos). */
  @Column('jsonb', { name: 'personal_meals', nullable: true })
  personalMeals: PersonalMeals | null;

  /** Montagem do plano individual: `null` = nunca pedida. */
  @Column('text', { nullable: true })
  personalization: Exclude<Personalization, null> | null;

  /** Quando a montagem começou (uma `pending` antiga é tratada como falha). */
  @Column('timestamptz', { name: 'personalization_at', nullable: true })
  personalizationAt: Date | null;

  @VersionColumn()
  version: number;
}
