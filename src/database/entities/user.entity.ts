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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
