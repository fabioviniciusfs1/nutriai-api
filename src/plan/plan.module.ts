import { Module } from '@nestjs/common';
import { AvoidController } from '../foods/avoid.controller.js';
import { FoodsController } from '../foods/foods.controller.js';
import { OffProductsService } from '../foods/off-products.service.js';
import { MealComposerService } from './composer/meal-composer.service.js';
import { DayLogService } from './day-log.service.js';
import { PlanVersionService } from './plan-version.service.js';
import { PlanController } from './plan.controller.js';
import { PlanService } from './plan.service.js';
import { PlanPersonalizerService } from './personalizer.service.js';

@Module({
  controllers: [PlanController, FoodsController, AvoidController],
  providers: [
    PlanService,
    DayLogService,
    PlanVersionService,
    MealComposerService,
    PlanPersonalizerService,
    OffProductsService,
  ],
  exports: [PlanService, PlanPersonalizerService],
})
export class PlanModule {}
