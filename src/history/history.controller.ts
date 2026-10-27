import {
  BadRequestException,
  Controller,
  Get,
  Param,
  type PipeTransform,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/auth.decorators.js';
import { Clock, type UserClock } from '../common/timezone.js';
import type {
  ActivityHistory,
  ActivitySource,
  HistorySummary,
  NutrientHistory,
  PlanHistoryEntry,
} from '../contract.js';
import {
  type HistoryPeriod,
  HistoryService,
  PERIODS,
} from './history.service.js';

/** `days` da query: 7, 30 ou `all` (desde a criação da conta). */
class Days implements PipeTransform<string, HistoryPeriod> {
  transform(value: string): HistoryPeriod {
    const period = value === 'all' ? value : Number(value);
    if (!PERIODS.includes(period))
      throw new BadRequestException(
        'Período inválido: use 7 ou 30 dias, ou todos.',
      );
    return period as HistoryPeriod;
  }
}

@Controller()
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get('history/summary')
  summary(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('days', Days) days: HistoryPeriod,
  ): Promise<HistorySummary> {
    return this.history.summary(userId, clock, days);
  }

  @Get('history/activity')
  activity(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('days', Days) days: HistoryPeriod,
  ): Promise<ActivityHistory> {
    return this.history.activity(userId, clock, days);
  }

  @Get('history/nutrients/:id')
  nutrient(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Param('id') id: string,
    @Query('days', Days) days: HistoryPeriod,
  ): Promise<NutrientHistory> {
    return this.history.nutrient(userId, clock, id, days);
  }

  @Get('history/plans')
  plans(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
  ): Promise<PlanHistoryEntry[]> {
    return this.history.plans(userId, clock);
  }

  @Get('activity-sources')
  sources(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
  ): Promise<ActivitySource[]> {
    return this.history.sources(userId, clock);
  }
}
