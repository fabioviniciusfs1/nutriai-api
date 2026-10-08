import { Module } from '@nestjs/common';
import { FoodsController } from '../foods/foods.controller.js';
import { MealComposerService } from './composer/meal-composer.service.js';
import { DayLogService } from './day-log.service.js';
import { PlanController } from './plan.controller.js';
import { PlanService } from './plan.service.js';
import { PlanPersonalizerService } from './personalizer.service.js';

@Module({
  controllers: [PlanController, FoodsController],
  providers: [
    PlanService,
    DayLogService,
    MealComposerService,
    PlanPersonalizerService,
  ],
  exports: [PlanService, PlanPersonalizerService],
})
export class PlanModule {}
