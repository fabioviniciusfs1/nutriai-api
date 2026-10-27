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
 * Versão do plano do usuário, base de `/history/plans`: a montada e, por dia, no máximo uma alterada com as
 * mudanças de alimentos e gramas daquele dia.
 */
@Entity('plan_versions')
@Index(['userId', 'id'])
export class PlanVersionEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  /** "AAAA-MM-DD" no fuso do usuário: dia em que foi montada ou alterada. */
  @Column('date')
  date: string;

  /** `false` = plano montado (assistente ou base); `true` = alterado pelo usuário. */
  @Column('boolean')
  edited: boolean;

  /** Refeições com títulos, alimentos e gramas (sem horários): igual = mesma versão. */
  @Column('text')
  fingerprint: string;

  @Column('jsonb')
  meals: PlanVersionMeal[];

  @Column('jsonb')
  totals: PlanVersionTotals;

  /** Alterações nessa versão, da mais recente para a mais antiga; `null` nas gravadas antes do horário. */
  @Column('jsonb', { nullable: true })
  changes: PlanHistoryEdit[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
