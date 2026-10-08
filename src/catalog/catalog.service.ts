import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import {
  BaseMealEntity,
  FoodEntity,
  MealSuggestionEntity,
  NutrientDefEntity,
} from '../database/entities/index.js';
import type { Catalog } from '../plan/engine/types.js';

/** Catálogo fixo (alimentos, sugestões, plano base, nutrientes), lido do banco e guardado em memória. */
@Injectable()
export class CatalogService {
  private cached: Promise<{
    catalog: Catalog;
    foods: FoodEntity[];
    nutrients: NutrientDefEntity[];
  }> | null = null;

  constructor(
    @InjectRepository(FoodEntity)
    private readonly foods: Repository<FoodEntity>,
    @InjectRepository(MealSuggestionEntity)
    private readonly suggestions: Repository<MealSuggestionEntity>,
    @InjectRepository(BaseMealEntity)
    private readonly baseMeals: Repository<BaseMealEntity>,
    @InjectRepository(NutrientDefEntity)
    private readonly nutrients: Repository<NutrientDefEntity>,
  ) {}

  private load() {
    this.cached ??= (async () => {
      const [foods, suggestions, baseMeals, nutrients] = await Promise.all([
        this.foods.find({ order: { name: 'ASC' } }),
        this.suggestions.find({ order: { position: 'ASC' } }),
        this.baseMeals.find({ order: { id: 'ASC' } }),
        this.nutrients.find({ order: { position: 'ASC' } }),
      ]);
      return {
        catalog: {
          foods: foods.map(({ name, group, per100g, animal }) => ({
            name,
            group,
            per100g,
            animal,
          })),
          suggestions: suggestions.map(({ title, periods, foods: items }) => ({
            title,
            periods,
            foods: items,
          })),
          baseMeals: baseMeals.map(
            ({ id, title, time, foods: items, minMealsPerDay }) => ({
              id,
              title,
              time,
              foods: items,
              minMealsPerDay,
            }),
          ),
        },
        foods,
        nutrients,
      };
    })().catch((error: unknown) => {
      this.cached = null;
      throw error;
    });
    return this.cached;
  }

  async catalog(): Promise<Catalog> {
    return (await this.load()).catalog;
  }

  /** Micronutrientes por 100 g de cada alimento (nome → id do nutriente → valor). */
  async micros(): Promise<Map<string, Record<string, number>>> {
    return new Map(
      (await this.load()).foods.map((food) => [food.name, food.microsPer100g]),
    );
  }

  async nutrientDefs(): Promise<NutrientDefEntity[]> {
    return (await this.load()).nutrients;
  }

  /** Esquece o cache (depois de mudar o catálogo no banco). */
  invalidate() {
    this.cached = null;
  }
}
