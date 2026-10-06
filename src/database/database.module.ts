import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { dataSourceOptions } from './data-source.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      // As migrations pendentes rodam ao subir a API.
      useFactory: (config: AppConfig) => ({
        ...dataSourceOptions(config.databaseUrl),
        migrationsRun: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
