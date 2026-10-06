import { ServiceUnavailableException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import type { AppConfig } from '../../config/app-config.js';

export const GOOGLE_UNAVAILABLE =
  'O login com o Google não está disponível agora.';

/** Se o OAuth do Google está configurado (credenciais e chave para guardar os tokens). */
export function googleConfigured({ google }: AppConfig) {
  return Boolean(
    google.clientId &&
    google.clientSecret &&
    google.callbackUrl &&
    google.tokenEncryptionKey,
  );
}

/** Cliente OAuth do Google com o callback deste backend. */
export function createOAuthClient(config: AppConfig): OAuth2Client {
  if (!googleConfigured(config))
    throw new ServiceUnavailableException(GOOGLE_UNAVAILABLE);
  const { clientId, clientSecret, callbackUrl } = config.google;
  return new OAuth2Client({ clientId, clientSecret, redirectUri: callbackUrl });
}
