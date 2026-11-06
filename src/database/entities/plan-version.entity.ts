import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  MealSlot,
  PlanHistoryEdit,
  PlanHistoryFood,
} from '../../contract.js';

/** Refeição numa versão do plano (`id` da refeição base, para comparar versões). */
export type PlanVersionMeal = {
  id: number;
  /** Ausente nas versões gravadas antes do campo: vale o da refeição base. */
  slot?: MealSlot;
  title: string;
  time: string;
  kcal: number;
  foods: PlanHistoryFood[];
};

export type PlanVersionTotals = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

/**
 * Plano do usuário no histórico (`/history/plans`): um por montagem, com as refeições como estão agora e o
 * registro das mudanças de alimentos e gramas feitas nele.
 */
@Entity('plan_versions')
@Index(['userId', 'id'])
@Index(['userId', 'scheduleId', 'id'])
export class PlanVersionEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  /** Grupo de dias da rotina do plano (`RoutineSchedule.id`). */
  @Column('int', { name: 'schedule_id', default: 1 })
  scheduleId: number;

  /** "AAAA-MM-DD" no fuso do usuário: dia em que foi montada. */
  @Column('date')
  date: string;

  /** Das versões de antes de `assembledAt` (`true` = alterada pelo usuário); a regra não usa mais. */
  @Column('boolean')
  edited: boolean;

  /** `schedule_plans.personalization_at` da montagem do assistente que gerou a versão; `null` no plano base. */
  @Column('timestamptz', { name: 'assembled_at', nullable: true })
  assembledAt: Date | null;

  /** Refeições com títulos, alimentos e gramas (sem horários): igual = mesma versão. */
  @Column('text')
  fingerprint: string;

  @Column('jsonb')
  meals: PlanVersionMeal[];

  @Column('jsonb')
  totals: PlanVersionTotals;

  /** Alterações nessa versão, da mais recente para a mais antiga. */
  @Column('jsonb', { nullable: true })
  changes: PlanHistoryEdit[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
