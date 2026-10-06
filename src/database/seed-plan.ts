import { FoodCatalog } from '../plan/engine/foods.js';
import type {
  BaseMeal,
  CatalogFood,
  MealSuggestion,
  PlanFood,
} from '../plan/engine/types.js';
import {
  baseMeals,
  mealSuggestions,
  type FoodPortionSeed,
} from './seed-data.js';

/**
 * Plano base e sugestões com os nutrientes de cada porção calculados pelo catálogo. Falha se algum
 * alimento não estiver no catálogo (ex.: a TACO ainda não foi importada).
 */
export function buildSeedPlan(foods: CatalogFood[]): {
  baseMeals: BaseMeal[];
  suggestions: MealSuggestion[];
} {
  const catalog = new FoodCatalog(foods);
  const missing = new Set<string>();
  const portions = (items: FoodPortionSeed[]): PlanFood[] =>
    items.flatMap(({ name, grams }) => {
      const portion = catalog.portion(name, grams);
      if (!portion) missing.add(name);
      return portion ? [portion] : [];
    });

  const result = {
    baseMeals: baseMeals.map((meal) => ({
      ...meal,
      foods: portions(meal.foods),
    })),
    suggestions: mealSuggestions.map((meal) => ({
      ...meal,
      foods: portions(meal.foods),
    })),
  };
  if (missing.size > 0) {
    throw new Error(
      `Alimentos do plano base ou das sugestões que não estão no catálogo: ${[...missing].join('; ')}. ` +
        'Importe a TACO antes (npm run db:import-taco -- data/taco/tabela-taco.ods).',
    );
  }
  return result;
}
