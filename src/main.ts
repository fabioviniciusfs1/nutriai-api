import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument, observeEnabled } from './app.module.js';
import { configureApp } from './configure-app.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: observeEnabled ? ObserveInstrument : undefined,
  });
  configureApp(app);
  await app.listen(app.get<AppConfig>(APP_CONFIG).port);
}
await bootstrap();
