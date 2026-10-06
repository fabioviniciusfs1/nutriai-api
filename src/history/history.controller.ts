import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/auth.decorators.js';
import { Clock, type UserClock } from '../common/timezone.js';
import type {
  ActivityHistory,
  ActivitySource,
  HistorySummary,
  NutrientHistory,
  PlanHistoryDay,
} from '../contract.js';
import { HistoryService } from './history.service.js';

const Days = () =>
  new ParseIntPipe({
    exceptionFactory: () =>
      new BadRequestException('Período inválido: use 7, 30 ou 90 dias.'),
  });

@Controller()
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get('history/summary')
  summary(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('days', Days()) days: number,
  ): Promise<HistorySummary> {
    return this.history.summary(userId, clock, days);
  }

  @Get('history/activity')
  activity(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('days', Days()) days: number,
  ): Promise<ActivityHistory> {
    return this.history.activity(userId, clock, days);
  }

  @Get('history/nutrients/:id')
  nutrient(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Param('id') id: string,
    @Query('days', Days()) days: number,
  ): Promise<NutrientHistory> {
    return this.history.nutrient(userId, clock, id, days);
  }

  @Get('history/plans')
  plans(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
  ): Promise<PlanHistoryDay[]> {
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
