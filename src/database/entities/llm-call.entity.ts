import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** O que a chamada ao Claude fazia. */
export type LlmTask = 'chat' | 'substitutes' | 'personal-plan' | 'meal-time';

/** Uma chamada à API da Anthropic: o pedido inteiro, a resposta (ou o erro), tokens e duração. */
@Entity('llm_calls')
@Index(['userId', 'id'])
export class LlmCallEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column('uuid', { name: 'user_id', nullable: true })
  userId: string | null;

  @Column('text')
  task: LlmTask;

  /** O modelo que respondeu (com o fallback, pode não ser o pedido); sem resposta, o pedido. */
  @Column('text')
  model: string;

  /** Os parâmetros enviados (system, messages, schema…). */
  @Column('jsonb')
  request: object;

  /** A resposta como veio da API; `null` com erro. */
  @Column('jsonb', { nullable: true })
  response: object | null;

  @Column('text', { name: 'stop_reason', nullable: true })
  stopReason: string | null;

  @Column('int', { name: 'input_tokens', nullable: true })
  inputTokens: number | null;

  @Column('int', { name: 'output_tokens', nullable: true })
  outputTokens: number | null;

  @Column('int', { name: 'duration_ms' })
  durationMs: number;

  @Column('text', { nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
