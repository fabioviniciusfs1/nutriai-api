import Anthropic from '@anthropic-ai/sdk';
import type { Provider } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

/**
 * Cliente da API da Anthropic; `null` sem `ANTHROPIC_API_KEY` (o chat responde 503, o plano fica o
 * padrão e os substitutos são os do mesmo grupo).
 */
export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

/** Modelo usado pelo chat e pelos substitutos (o mais barato, por escolha do usuário). */
export const CLAUDE_MODEL = 'claude-haiku-5-5';

/** Modelo da montagem do plano individual: roda uma vez por usuário, então vale um modelo mais forte. */
export const CLAUDE_PLAN_MODEL = 'claude-sonnet-5-5';

export const anthropicProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  inject: [APP_CONFIG],
  useFactory: ({ anthropic }: AppConfig) =>
    anthropic.apiKey
      ? new Anthropic({
          apiKey: anthropic.apiKey,
          defaultHeaders: anthropic.workspaceId
            ? { 'anthropic-workspace-id': anthropic.workspaceId }
            : undefined,
        })
      : null,
};
