import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { ScheduleModule } from '@nestjs/schedule';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ChatModule } from './chat/chat.module.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { HistoryModule } from './history/history.module.js';
import { NutritionModule } from './nutrition/nutrition.module.js';
import { PlanModule } from './plan/plan.module.js';
import { UsersModule } from './users/users.module.js';
import { WeightsModule } from './weights/weights.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

/**
 * O Observe só liga com as chaves (`OBSERVE_APP_KEY` e `OBSERVE_APP_SECRET`); sem elas o coletor
 * recusa a telemetria. Lido quando o módulo carrega: o `AppConfigModule` já pôs o `.env` em `process.env`.
 */
export const observeEnabled = Boolean(
  process.env.OBSERVE_APP_KEY?.trim() && process.env.OBSERVE_APP_SECRET?.trim(),
);

@Module({
  imports: [
    AppConfigModule,
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ...(observeEnabled
      ? [
          ObserveModule.forRootAsync({
            inject: [APP_CONFIG],
            useFactory: ({ observe }: AppConfig) => ({
              appKey: observe.appKey,
              appSecret: observe.appSecret,
              serviceId: 'nutriai-api',
            }),
          }),
        ]
      : []),
    DatabaseModule,
    ScheduleModule.forRoot(),
    AiModule,
    CatalogModule,
    UsersModule,
    HealthModule,
    AuthModule,
    WeightsModule,
    PlanModule,
    NutritionModule,
    HistoryModule,
    ChatModule,
  ],
})
export class AppModule {}
