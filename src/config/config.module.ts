import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_CONFIG, loadConfig } from './app-config.js';

@Global()
@Module({
  // Só carrega o `.env` para `process.env`; quem lê é `loadConfig`.
  imports: [
    ConfigModule.forRoot({ ignoreEnvFile: process.env.NODE_ENV === 'test' }),
  ],
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
