import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Código de uso único devolvido ao front depois do login com Google (trocado por um token). */
@Entity('oauth_codes')
export class OAuthCodeEntity {
  /** SHA-256 do código: o código em si nunca é guardado. */
  @PrimaryColumn('text', { name: 'code_hash' })
  codeHash: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column('text', { name: 'redirect_uri' })
  redirectUri: string;

  @Column('timestamptz', { name: 'expires_at' })
  expiresAt: Date;

  @Column('timestamptz', { name: 'used_at', nullable: true })
  usedAt: Date | null;
}
