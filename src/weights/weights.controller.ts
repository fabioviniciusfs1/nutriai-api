import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../common/auth.decorators.js';
import { Clock, type UserClock } from '../common/timezone.js';
import type { WeightEntry } from '../contract.js';
import { AddWeightDto } from './weights.dto.js';
import { WeightsService } from './weights.service.js';

@Controller('weights')
export class WeightsController {
  constructor(private readonly weights: WeightsService) {}

  @Get()
  list(@CurrentUser() userId: string): Promise<WeightEntry[]> {
    return this.weights.list(userId);
  }

  @Post()
  @HttpCode(200)
  add(
    @CurrentUser() userId: string,
    @Body() body: AddWeightDto,
    @Clock() clock: UserClock,
  ): Promise<WeightEntry[]> {
    return this.weights.add(userId, body.kg, body.at, clock);
  }
}
