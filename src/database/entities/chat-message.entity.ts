import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('chat_messages')
@Index(['userId', 'id'])
export class ChatMessageEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column('text')
  role: 'assistant' | 'user';

  @Column('text')
  text: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
