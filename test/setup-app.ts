import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { ANTHROPIC_CLIENT } from '../src/ai/anthropic.provider.js';
import { configureApp } from '../src/configure-app.js';
import { importTaco } from '../src/database/sources/taco/import.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://nutriai:nutriai@localhost:5433/nutriai_test';

export const FRONTEND = 'http://localhost:3000';

/** API com banco de teste limpo (migrations + TACO + semente) e o cliente da Anthropic trocado por `anthropic`. */
export async function createTestApp(
  anthropic: unknown,
): Promise<INestApplication> {
  Object.assign(process.env, {
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: 'segredo-dos-testes',
    FRONTEND_URLS: FRONTEND,
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    GOOGLE_CALLBACK_URL: 'http://localhost:3001/auth/google/callback',
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    ANTHROPIC_API_KEY: '',
    HEALTH_SYNC_CRON: 'off',
  });

  // Começa do zero: as migrations rodam ao subir a API.
  const reset = await new DataSource({
    type: 'postgres',
    url: TEST_DATABASE_URL,
  }).initialize();
  await reset.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await reset.destroy();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ANTHROPIC_CLIENT)
    .useValue(anthropic)
    .compile();
  const app = configureApp(
    moduleRef.createNestApplication({ logger: ['error'] }),
  );
  await app.init();
  await importTaco(app.get(DataSource), 'data/taco/tabela-taco.ods');
  return app;
}
