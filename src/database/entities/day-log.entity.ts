import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { FoodFeedback } from '../../contract.js';

export type DayLogMeal = { time: string; title: string; kcal: number };

/** Foto do plano de um dia do usuário: é a base do histórico. */
@Entity('day_logs')
export class DayLogEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  /** "AAAA-MM-DD" no fuso do usuário. */
  @PrimaryColumn('date')
  date: string;

  @Column('jsonb')
  meals: DayLogMeal[];

  @Column('int', { name: 'consumed_kcal' })
  consumedKcal: number;

  /** Consumo do dia por nutriente (id → valor). */
  @Column('jsonb')
  nutrients: Record<string, number>;

  /** Alimentos marcados neste dia. */
  @Column('jsonb', { name: 'flagged_foods', default: [] })
  flaggedFoods: { name: string; feedback: FoodFeedback }[];
}
