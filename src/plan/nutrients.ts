import type { PlanMeal } from '../contract.js';

/**
 * Consumo de cada nutriente num plano (id → valor): macronutrientes em gramas, somados como aparecem,
 * e os outros a partir dos valores por 100 g do catálogo (uma casa decimal).
 */
export function planNutrients(
  meals: PlanMeal[],
  micros: Map<string, Record<string, number>>,
) {
  const foods = meals.flatMap((meal) => meal.foods);
  const totals: Record<string, number> = {
    proteinas: foods.reduce((sum, food) => sum + food.protein, 0),
    gorduras: foods.reduce((sum, food) => sum + food.fat, 0),
    carboidratos: foods.reduce((sum, food) => sum + food.carbs, 0),
  };
  for (const food of foods) {
    for (const [id, per100g] of Object.entries(micros.get(food.name) ?? {})) {
      totals[id] = (totals[id] ?? 0) + (per100g * food.grams) / 100;
    }
  }
  for (const id of Object.keys(totals))
    totals[id] = Math.round(totals[id] * 10) / 10;
  return totals;
}
