import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from './transformers.js';

@Entity('weights')
@Index(['userId', 'at'])
export class WeightEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column('timestamptz')
  at: Date;

  @Column('numeric', {
    precision: 4,
    scale: 1,
    transformer: numericTransformer,
  })
  kg: number;
}
