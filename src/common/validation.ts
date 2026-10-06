import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

function firstMessage(errors: ValidationError[]): string | undefined {
  for (const error of errors) {
    const message =
      Object.values(error.constraints ?? {})[0] ??
      firstMessage(error.children ?? []);
    if (message) return message;
  }
  return undefined;
}

/**
 * Valida os DTOs e responde `400` com a primeira mensagem (os DTOs definem as mensagens em pt-BR).
 * Campos desconhecidos são descartados.
 */
export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException(firstMessage(errors) ?? 'Dados inválidos.'),
  });
}
