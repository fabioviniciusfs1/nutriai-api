import type { INestApplication } from '@nestjs/common';
import { HttpErrorFilter } from './common/http-error.filter.js';
import { createValidationPipe } from './common/validation.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';

/** Configuração HTTP comum à API e aos testes e2e: CORS, validação e formato dos erros. */
export function configureApp(app: INestApplication) {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.enableCors({
    origin: config.frontendUrls,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Timezone'],
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpErrorFilter());
  return app;
}
