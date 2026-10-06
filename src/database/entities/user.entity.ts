import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Profile } from '../../contract.js';

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
