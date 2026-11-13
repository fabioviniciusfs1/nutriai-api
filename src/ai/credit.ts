import Anthropic from '@anthropic-ai/sdk';
import { ServiceUnavailableException } from '@nestjs/common';

/** Mensagem ao usuário quando a conta da Anthropic está sem créditos. */
export const OUT_OF_CREDIT =
  'O assistente está sem créditos no momento. Avise o suporte ou tente de novo mais tarde.';

/**
 * Erro de cobrança da API da Anthropic: `billing_error` (402) ou o `400` "Your credit balance is too low…".
 */
export function isOutOfCredit(error: unknown): boolean {
  if (!(error instanceof Anthropic.APIError)) return false;
  return (
    error.type === 'billing_error' ||
    error.status === 402 ||
    /credit balance/i.test(error.message)
  );
}

/** `503` com {@link OUT_OF_CREDIT}: passa direto pelos fallbacks das chamadas ao Claude. */
export class OutOfCreditException extends ServiceUnavailableException {
  constructor() {
    super(OUT_OF_CREDIT);
  }
}
