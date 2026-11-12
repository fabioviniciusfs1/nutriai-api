import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { FeedbackAnswer } from '../../contract.js';

/** Resposta do formulário de feedback: uma por usuário. */
@Entity('feedback_responses')
export class FeedbackResponseEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @Column('jsonb')
  answers: FeedbackAnswer[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** Quando a resposta chegou ao Google Forms; `null` se não foi (desligado ou falhou). */
  @Column('timestamptz', { name: 'google_sent_at', nullable: true })
  googleSentAt: Date | null;

  /** Erro do último envio ao Google Forms. */
  @Column('text', { name: 'google_error', nullable: true })
  googleError: string | null;
}
