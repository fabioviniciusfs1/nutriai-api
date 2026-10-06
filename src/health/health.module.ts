import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ActivityDayEntity,
  GoogleAccountEntity,
} from '../database/entities/index.js';
import { HealthSyncScheduler } from './health-sync.scheduler.js';
import { HealthService } from './health.service.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([GoogleAccountEntity, ActivityDayEntity])],
  providers: [HealthService, HealthSyncScheduler],
  exports: [HealthService],
})
export class HealthModule {}
