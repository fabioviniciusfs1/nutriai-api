import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ActivityDayEntity,
  DayLogEntity,
  GoogleAccountEntity,
} from '../database/entities/index.js';
import { PlanModule } from '../plan/plan.module.js';
import { HistoryController } from './history.controller.js';
import { HistoryService } from './history.service.js';

@Module({
  imports: [
    PlanModule,
    TypeOrmModule.forFeature([
      DayLogEntity,
      ActivityDayEntity,
      GoogleAccountEntity,
    ]),
  ],
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}
