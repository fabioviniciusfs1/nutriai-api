import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Atividade de um dia importada da Google Health API. */
@Entity('activity_days')
export class ActivityDayEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @PrimaryColumn('date')
  date: string;

  /** Gasto total do dia (kcal). */
  @Column('int')
  burned: number;

  @Column('int', { name: 'active_calories' })
  activeCalories: number;

  @Column('int')
  steps: number;

  @Column('int', { name: 'active_minutes' })
  activeMinutes: number;

  @Column('double precision', { name: 'distance_km' })
  distanceKm: number;

  @Column('text')
  source: string;
}
