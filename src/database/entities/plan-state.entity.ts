import { Column, Entity, PrimaryColumn, VersionColumn } from 'typeorm';
import type { FoodFeedback, Personalization } from '../../contract.js';
import type {
  DayPlanChanges,
  PersonalMeals,
  PlanChanges,
} from '../../plan/engine/types.js';

/**
 * Mudanças do usuário no plano (espelha o que o front antigo guardava em `reference/auth.ts`).
 * Permanentes até o usuário desfazer, exceto `dayPlan`, que só vale no dia em que foi feito.
 */
@Entity('plan_states')
export class PlanStateEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  /** Horário escolhido para cada refeição do plano base (id → "HH:MM"). */
  @Column('jsonb', { name: 'meal_times', default: {} })
  mealTimes: Record<number, string>;

  @Column('jsonb', {
    name: 'plan_changes',
    default: { removed: [], added: [], extraFoods: {}, scales: {} },
  })
  planChanges: PlanChanges;

  /** Mudanças de um dia ("sugerir" e "redistribuir"); em outro dia são ignoradas. */
  @Column('jsonb', { name: 'day_plan', nullable: true })
  dayPlan: { date: string; changes: DayPlanChanges } | null;

  /** Alimentos restritos (nome → marcação). Liberar tira daqui, mas não desfaz as trocas. */
  @Column('jsonb', { name: 'food_feedback', default: {} })
  foodFeedback: Record<string, FoodFeedback>;

  /** Trocas de "Não gosto"/"Não tenho" em todas as refeições (nome → substituto; "" = sem substituto). */
  @Column('jsonb', { name: 'food_substitutes', default: {} })
  foodSubstitutes: Record<string, string>;

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
