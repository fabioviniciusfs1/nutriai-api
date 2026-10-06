import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WeightEntity } from '../database/entities/index.js';
import { WeightsController } from './weights.controller.js';
import { WeightsService } from './weights.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([WeightEntity])],
  controllers: [WeightsController],
  providers: [WeightsService],
})
export class WeightsModule {}
