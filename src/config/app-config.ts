/** Configuração lida do ambiente (ver `.env.example`). */
export type AppConfig = {
  port: number;
  databaseUrl: string;
  jwt: { secret: string; expiresIn: string };
  /** Origens do front: liberadas no CORS e aceitas como `redirect_uri` do login com Google. */
  frontendUrls: string[];
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    /** Chave AES-256 (32 bytes) do refresh token guardado; vazia se o Google não estiver configurado. */
    tokenEncryptionKey: Buffer | null;
  };
  anthropic: {
    apiKey: string;
    /** Exigido por chaves de usuário (sem workspace): vai no cabeçalho `anthropic-workspace-id`. */
    workspaceId: string;
  };
  observe: { appKey: string; appSecret: string };
  /** Sincronização agendada com a Google Health API; `cron` `null` = desligada. */
  healthSync: { cron: string | null; timeZone: string };
};

function required(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value)
    throw new Error(
      `Variável de ambiente ${name} não definida (veja .env.example).`,
    );
  return value;
}

function encryptionKey(raw: string | undefined) {
  if (!raw?.trim()) return null;
  const key = Buffer.from(raw.trim(), 'base64');
  if (key.length !== 32)
    throw new Error('TOKEN_ENCRYPTION_KEY deve ter 32 bytes em base64.');
  return key;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: required(env, 'DATABASE_URL'),
    jwt: {
      secret: required(env, 'JWT_SECRET'),
      expiresIn: env.JWT_EXPIRES_IN?.trim() || '7d',
    },
    frontendUrls: (env.FRONTEND_URLS ?? '')
      .split(',')
      .map((url) => url.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    google: {
      clientId: env.GOOGLE_CLIENT_ID?.trim() ?? '',
      clientSecret: env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
      callbackUrl: env.GOOGLE_CALLBACK_URL?.trim() ?? '',
      tokenEncryptionKey: encryptionKey(env.TOKEN_ENCRYPTION_KEY),
    },
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY?.trim() ?? '',
      workspaceId: env.ANTHROPIC_WORKSPACE_ID?.trim() ?? '',
    },
    observe: {
      appKey: env.OBSERVE_APP_KEY ?? '',
      appSecret: env.OBSERVE_APP_SECRET ?? '',
    },
    healthSync: {
      // Padrão: todo dia às 03:00. "off" desliga.
      cron:
        env.HEALTH_SYNC_CRON?.trim().toLowerCase() === 'off'
          ? null
          : env.HEALTH_SYNC_CRON?.trim() || '0 3 * * *',
      timeZone: env.HEALTH_SYNC_TIMEZONE?.trim() || 'America/Sao_Paulo',
    },
  };
}

/** Token de injeção da configuração já carregada. */
export const APP_CONFIG = Symbol('APP_CONFIG');
