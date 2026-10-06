import { Not, In, type DataSource } from 'typeorm';
import {
  BaseMealEntity,
  FoodEntity,
  MealSuggestionEntity,
  NutrientDefEntity,
} from './entities/index.js';
import { nutrientDefs } from './seed-data.js';
import { buildSeedPlan } from './seed-plan.js';

/**
 * Grava o plano base, as sugestões e os nutrientes acompanhados, com as porções calculadas pelo
 * catálogo já importado. Idempotente: atualiza o que existe e remove o que saiu da semente.
 */
export async function seedCatalog(dataSource: DataSource) {
  await dataSource.transaction(async (manager) => {
    const foods = await manager.find(FoodEntity);
    const { baseMeals, suggestions } = buildSeedPlan(foods);

    await manager.upsert(
      BaseMealEntity,
      baseMeals.map((meal) => ({
        ...meal,
        minMealsPerDay: meal.minMealsPerDay ?? 3,
      })),
      ['id'],
    );
    await manager.delete(BaseMealEntity, {
      id: Not(In(baseMeals.map((meal) => meal.id))),
    });

    await manager.upsert(
      MealSuggestionEntity,
      suggestions.map((meal, position) => ({ ...meal, position })),
      ['title'],
    );
    await manager.delete(MealSuggestionEntity, {
      title: Not(In(suggestions.map((meal) => meal.title))),
    });

    await manager.upsert(
      NutrientDefEntity,
      nutrientDefs.map((nutrient, position) => ({
        ...nutrient,
        limit: nutrient.limit ?? false,
        position,
      })),
      ['id'],
    );
    await manager.delete(NutrientDefEntity, {
      id: Not(In(nutrientDefs.map((nutrient) => nutrient.id))),
    });
  });
}
