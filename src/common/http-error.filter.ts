import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/** Mensagem genérica: detalhes de erros inesperados ficam só no log. */
const INTERNAL_ERROR = 'Erro interno. Tente novamente.';

function messageOf(exception: HttpException) {
  const body = exception.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: unknown; error?: unknown }).message;
  if (Array.isArray(message)) return String(message[0]);
  if (typeof message === 'string') return message;
  return exception.message;
}

/** Todo erro sai como `{ "error": "mensagem em pt-BR" }`, mostrada ao usuário como está. */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) this.logger.error(exception.message, exception.stack);
      response.status(status).json({
        error:
          status >= 500 && status !== 503
            ? INTERNAL_ERROR
            : messageOf(exception),
      });
      return;
    }
    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: INTERNAL_ERROR });
  }
}
