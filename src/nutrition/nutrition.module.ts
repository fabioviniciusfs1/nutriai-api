import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityDayEntity } from '../database/entities/index.js';
import { PlanModule } from '../plan/plan.module.js';
import { NutritionController } from './nutrition.controller.js';
import { NutritionService } from './nutrition.service.js';

@Module({
  imports: [PlanModule, TypeOrmModule.forFeature([ActivityDayEntity])],
  controllers: [NutritionController],
  providers: [NutritionService],
})
export class NutritionModule {}
