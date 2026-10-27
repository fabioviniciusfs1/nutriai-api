import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { DietSettings, Profile, Routine } from '../../contract.js';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { unique: true })
  username: string;

  /** `null` = conta criada pelo Google (sem senha). */
  @Column('text', { name: 'password_hash', nullable: true })
  passwordHash: string | null;

  /** `null` até o primeiro `PUT /me/profile`. */
  @Column('jsonb', { nullable: true })
  profile: Profile | null;

  /** `null` até o primeiro `PUT /me/routine`. */
  @Column('jsonb', { nullable: true })
  routine: Routine | null;

  /** Ajuste da dieta (`PUT /me/diet`); `null` = os padrões. */
  @Column('jsonb', { name: 'diet_settings', nullable: true })
  dietSettings: DietSettings | null;

  /** Dia em que o peso meta foi salvo ("AAAA-MM-DD"), começo da projeção; `null` sem peso meta. */
  @Column('date', { name: 'target_weight_set_on', nullable: true })
  targetWeightSetOn: string | null;

  /** Meta calórica ajustada pelo usuário (±10%, `POST /me/calories`); `null` = a calculada pelo perfil. */
  @Column('int', { name: 'calorie_goal', nullable: true })
  calorieGoal: number | null;

  /** Quando foi o último ajuste das calorias: as sugestões só olham as pesagens a partir desse dia. */
  @Column('timestamptz', { name: 'calorie_goal_set_at', nullable: true })
  calorieGoalSetAt: Date | null;

  /**
   * Objetivo de agora pelo último peso meta salvo (`PUT /me/target-weight`): acima do peso atual = ganhar, abaixo =
   * perder. `null` = o objetivo do perfil.
   */
  @Column('text', { name: 'weight_goal', nullable: true })
  weightGoal: 'perder' | 'ganhar' | null;

  /** Quando o objetivo virou (de perder para ganhar ou o contrário): o ajuste das calorias sugere na hora. */
  @Column('timestamptz', { name: 'weight_goal_set_at', nullable: true })
  weightGoalSetAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
