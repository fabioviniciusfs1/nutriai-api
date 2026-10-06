import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BaseMealEntity,
  FoodEntity,
  MealSuggestionEntity,
  NutrientDefEntity,
} from '../database/entities/index.js';
import { CatalogService } from './catalog.service.js';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FoodEntity,
      MealSuggestionEntity,
      BaseMealEntity,
      NutrientDefEntity,
    ]),
  ],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
