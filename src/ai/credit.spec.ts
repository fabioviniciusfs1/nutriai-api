import Anthropic from '@anthropic-ai/sdk';
import { isOutOfCredit } from './credit.js';

const headers = new Headers();

function apiError(status: number, type: string, message: string) {
  return Anthropic.APIError.generate(
    status,
    { type: 'error', error: { type, message } },
    undefined,
    headers,
  );
}

describe('isOutOfCredit', () => {
  it('reconhece o erro de cobrança', () => {
    expect(isOutOfCredit(apiError(402, 'billing_error', 'Sem saldo'))).toBe(
      true,
    );
    expect(
      isOutOfCredit(
        apiError(
          400,
          'invalid_request_error',
          'Your credit balance is too low to access the Anthropic API.',
        ),
      ),
    ).toBe(true);
  });

  it('ignora os outros erros', () => {
    expect(isOutOfCredit(apiError(429, 'rate_limit_error', 'Limite'))).toBe(
      false,
    );
    expect(isOutOfCredit(apiError(500, 'api_error', 'Falhou'))).toBe(false);
    expect(
      isOutOfCredit(apiError(400, 'invalid_request_error', 'max_tokens')),
    ).toBe(false);
    expect(isOutOfCredit(new Error('credit balance'))).toBe(false);
  });
});
