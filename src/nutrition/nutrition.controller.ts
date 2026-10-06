import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/auth.decorators.js';
import { Clock, type UserClock } from '../common/timezone.js';
import type { NutrientGroup, NutritionToday } from '../contract.js';
import { NutritionService } from './nutrition.service.js';

@Controller()
export class NutritionController {
  constructor(private readonly nutrition: NutritionService) {}

  @Get('nutrition/today')
  today(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
  ): Promise<NutritionToday> {
    return this.nutrition.today(userId, clock);
  }

  @Get('nutrients/groups')
  groups(): Promise<NutrientGroup[]> {
    return this.nutrition.groups();
  }
}
