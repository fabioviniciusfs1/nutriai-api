import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import type { DataSource, Repository } from 'typeorm';
import { localDate, userClock, type UserClock } from '../../common/timezone.js';
import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';
import type { AuthResponse, GoogleLinkResponse, Me } from '../../contract.js';
import {
  GoogleAccountEntity,
  OAuthCodeEntity,
  UserEntity,
} from '../../database/entities/index.js';
import { HEALTH_SCOPES } from '../../health/health-api.js';
import { HealthService } from '../../health/health.service.js';
import { UsersService } from '../../users/users.service.js';
import { AuthService, isUniqueViolation } from '../auth.service.js';
import { createOAuthClient } from './google-oauth.js';
import { encryptToken } from './token-crypto.js';
import { usernameFromEmail, usernameWithSuffix } from './username.js';

/** Validade do código de uso único entregue ao front. */
const CODE_TTL_MS = 60 * 1000;
/** Validade do `state` enviado ao Google (tempo para o usuário consentir). */
const STATE_TTL = '10m';

const EXCHANGE_EXPIRED = 'O login com o Google expirou. Tente novamente.';
const REDIRECT_NOT_ALLOWED = 'Endereço de retorno não permitido.';

/** O que o backend guarda no `state` assinado que vai e volta do Google. */
type GoogleState =
  | {
      typ: 'google-state';
      mode: 'login';
      redirectUri: string;
      frontState: string;
    }
  | {
      typ: 'google-state';
      mode: 'link';
      redirectUri: string;
      frontState: string;
      userId: string;
    };

/** Erro do fluxo do Google com mensagem para o usuário (vai na URL de volta). */
class GoogleFlowError extends Error {}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

/** `redirectUri` com os parâmetros de volta para o front. */
function backTo(redirectUri: string, params: Record<string, string>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return url.toString();
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(GoogleAccountEntity)
    private readonly accounts: Repository<GoogleAccountEntity>,
    @InjectRepository(OAuthCodeEntity)
    private readonly codes: Repository<OAuthCodeEntity>,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly usersService: UsersService,
    private readonly health: HealthService,
  ) {}

  /** Aceita só páginas de volta nas origens do front (`FRONTEND_URLS`). */
  private checkRedirectUri(redirectUri: string | undefined): string {
    try {
      const url = new URL(redirectUri ?? '');
      if (this.config.frontendUrls.includes(url.origin)) return url.toString();
    } catch {
      // URL inválida: cai no erro abaixo.
    }
    throw new BadRequestException(REDIRECT_NOT_ALLOWED);
  }

  private consentUrl(state: GoogleState) {
    return createOAuthClient(this.config).generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: ['openid', 'email', 'profile', ...HEALTH_SCOPES],
      state: this.jwt.sign(state, { expiresIn: STATE_TTL }),
    });
  }

  /** URL de consentimento do login com Google. */
  startLogin(
    redirectUri: string | undefined,
    frontState: string | undefined,
  ): string {
    const checked = this.checkRedirectUri(redirectUri);
    if (!frontState) throw new BadRequestException('Requisição inválida.');
    return this.consentUrl({
      typ: 'google-state',
      mode: 'login',
      redirectUri: checked,
      frontState,
    });
  }

  /** URL de consentimento para conectar o Google à conta já logada. */
  async startLink(
    userId: string,
    redirectUri: string,
    frontState: string,
  ): Promise<GoogleLinkResponse> {
    const checked = this.checkRedirectUri(redirectUri);
    await this.usersService.get(userId);
    return {
      url: this.consentUrl({
        typ: 'google-state',
        mode: 'link',
        redirectUri: checked,
        frontState,
        userId,
      }),
    };
  }

  /**
   * Volta do Google: devolve para onde redirecionar o navegador. Só lança (`400`) se o `state` for
   * inválido, porque aí não há para onde voltar com segurança.
   */
  async callback(query: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<string> {
    let state: GoogleState;
    try {
      state = await this.jwt.verifyAsync<GoogleState>(query.state ?? '');
      if (state.typ !== 'google-state') throw new Error('state de outro tipo');
    } catch {
      throw new BadRequestException(EXCHANGE_EXPIRED);
    }
    const fail = (message: string) =>
      backTo(state.redirectUri, { error: message, state: state.frontState });

    if (query.error || !query.code) {
      return fail(
        state.mode === 'login'
          ? 'Login com o Google cancelado.'
          : 'Conexão com o Google cancelada.',
      );
    }
    try {
      const google = await this.googleIdentity(query.code);
      if (state.mode === 'login') {
        const userId = await this.loginUser(google);
        const code = await this.issueCode(userId, state.redirectUri);
        return backTo(state.redirectUri, { code, state: state.frontState });
      }
      await this.linkUser(state.userId, google);
      return backTo(state.redirectUri, {
        connected: '1',
        state: state.frontState,
      });
    } catch (error) {
      if (error instanceof GoogleFlowError) return fail(error.message);
      this.logger.error(
        `Falha no retorno do Google: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return fail(
        state.mode === 'login'
          ? 'Não foi possível entrar com o Google. Tente novamente.'
          : 'Não foi possível conectar o Google. Tente novamente.',
      );
    }
  }

  /** Troca o `code` do Google pelos tokens e valida o `id_token`. */
  private async googleIdentity(code: string) {
    const client = createOAuthClient(this.config);
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new Error('o Google não devolveu id_token');
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.config.google.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email)
      throw new Error('id_token sem sub ou e-mail');
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name?.trim() || payload.email.split('@')[0],
      refreshTokenEnc: tokens.refresh_token
        ? encryptToken(
            tokens.refresh_token,
            this.config.google.tokenEncryptionKey!,
          )
        : null,
    };
  }

  /** Acha o usuário pelo `sub` do Google ou cria um novo (sem senha e sem perfil). */
  private async loginUser(
    google: Awaited<ReturnType<GoogleAuthService['googleIdentity']>>,
  ): Promise<string> {
    const existing = await this.accounts.findOneBy({ sub: google.sub });
    if (existing) {
      await this.accounts.update(
        { userId: existing.userId },
        {
          email: google.email,
          ...(google.refreshTokenEnc
            ? { refreshTokenEnc: google.refreshTokenEnc }
            : {}),
        },
      );
      void this.health.syncNow(existing.userId, userClock(undefined));
      return existing.userId;
    }

    const base = usernameFromEmail(google.email);
    for (let attempt = 0; attempt < 20; attempt++) {
      const username =
        attempt === 0
          ? base
          : usernameWithSuffix(base, Math.floor(1000 + Math.random() * 9000));
      try {
        const userId = await this.dataSource.transaction(async (manager) => {
          const user = await manager.save(
            manager.create(UserEntity, {
              name: google.name,
              username,
              passwordHash: null,
              profile: null,
            }),
          );
          await manager.insert(GoogleAccountEntity, {
            userId: user.id,
            sub: google.sub,
            email: google.email,
            refreshTokenEnc: google.refreshTokenEnc,
            startDate: this.connectionDay(),
          });
          return user.id;
        });
        void this.health.syncNow(userId, userClock(undefined));
        return userId;
      } catch (error) {
        // `username` já usado: tenta outro. `sub` criado em paralelo: usa o que entrou.
        if (!isUniqueViolation(error)) throw error;
        const raced = await this.accounts.findOneBy({ sub: google.sub });
        if (raced) return raced.userId;
      }
    }
    throw new Error('não foi possível gerar um username livre');
  }

  /** Liga a conta Google ao usuário logado (substitui uma conta Google anterior dele). */
  private async linkUser(
    userId: string,
    google: Awaited<ReturnType<GoogleAuthService['googleIdentity']>>,
  ) {
    const owner = await this.accounts.findOneBy({ sub: google.sub });
    if (owner && owner.userId !== userId) {
      throw new GoogleFlowError(
        'Essa conta Google já está conectada a outro usuário.',
      );
    }
    if (!(await this.users.existsBy({ id: userId })))
      throw new GoogleFlowError('Sua sessão expirou. Entre novamente.');
    const current = await this.accounts.findOneBy({ userId });
    try {
      await this.accounts.save({
        userId,
        sub: google.sub,
        email: google.email,
        refreshTokenEnc:
          google.refreshTokenEnc ??
          (current?.sub === google.sub ? current.refreshTokenEnc : null),
        // A mesma conta Google mantém o dia 0 e a última sincronização; outra conta começa do dia de hoje.
        lastSync: current?.sub === google.sub ? current.lastSync : null,
        startDate:
          current?.sub === google.sub
            ? current.startDate
            : this.connectionDay(),
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new GoogleFlowError(
          'Essa conta Google já está conectada a outro usuário.',
        );
      throw error;
    }
    void this.health.syncNow(userId, userClock(undefined));
  }

  /**
   * Dia 0 de uma conta Google conectada agora: a atividade só é importada a partir dele. O retorno do
   * Google não traz o fuso do usuário, então vale o da sincronização (`HEALTH_SYNC_TIMEZONE`).
   */
  private connectionDay() {
    return localDate(new Date(), this.config.healthSync.timeZone);
  }

  /** Código de uso único, ligado ao usuário e ao `redirectUri`; só o hash é guardado. */
  private async issueCode(userId: string, redirectUri: string) {
    const code = randomBytes(32).toString('base64url');
    await this.codes.insert({
      codeHash: hashCode(code),
      userId,
      redirectUri,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      usedAt: null,
    });
    return code;
  }

  /** Troca o código de uso único pelo token da sessão (uma vez só). */
  async exchange(code: string, redirectUri: string): Promise<AuthResponse> {
    const result = await this.codes
      .createQueryBuilder()
      .update()
      .set({ usedAt: () => 'now()' })
      .where('code_hash = :hash', { hash: hashCode(code) })
      .andWhere('used_at IS NULL')
      .andWhere('expires_at > now()')
      .andWhere('redirect_uri = :redirectUri', { redirectUri })
      .returning(['userId'])
      .execute();
    const row = (result.raw as { user_id: string }[])[0];
    if (!row) throw new BadRequestException(EXCHANGE_EXPIRED);
    return this.auth.issueToken(row.user_id);
  }

  /** Desconecta o Google (apaga os tokens e para de importar). */
  async disconnect(userId: string, clock: UserClock): Promise<Me> {
    const user = await this.usersService.get(userId);
    if (user.passwordHash === null) {
      throw new ConflictException(
        'Sua conta foi criada com o Google e não pode ser desconectada dele.',
      );
    }
    await this.accounts.delete({ userId });
    return this.usersService.me(userId, clock);
  }
}
