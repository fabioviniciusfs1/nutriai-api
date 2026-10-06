import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { UserEntity } from './user.entity.js';

/** Conta Google ligada ao usuário (login e acesso à Google Health API). */
@Entity('google_accounts')
export class GoogleAccountEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  /** `sub` do `id_token` do Google. */
  @Column('text', { unique: true })
  sub: string;

  @Column('text')
  email: string;

  /** Refresh token criptografado (AES-256-GCM); `null` se o Google não devolveu. */
  @Column('text', { name: 'refresh_token_enc', nullable: true })
  refreshTokenEnc: string | null;

  @Column('timestamptz', { name: 'last_sync', nullable: true })
  lastSync: Date | null;

  /** Dia 0: o dia em que a conta Google foi conectada ("AAAA-MM-DD"). Nada antes dele é importado. */
  @Column('date', { name: 'start_date' })
  startDate: string;
}
