// Substituição de alimentos marcados como "Não gosto / Não quero / Não tenho".
// - "Não gosto" e "Não tenho": troca permanente em todas as refeições.
// - "Não quero": troca permanente só na refeição marcada (o alimento continua nas outras).
// O substituto entra com as mesmas calorias. A marcação em si (restrição para o assistente) é
// separada das trocas: liberar o alimento na página Alimentos não desfaz trocas já feitas.
import type { FoodFeedback } from "@/lib/food-feedback";
import { foodCatalog } from "@/lib/mock-data";

export type PlanFood = { name: string; grams: number; carbs: number; protein: number; fat: number; kcal: number };

/** Evita laço se as substituições formarem um ciclo (A → B → A). */
const MAX_CHAIN = 5;

export function catalogEntry(name: string) {
  return foodCatalog.find((food) => food.name === name);
}

/** O alimento `name` numa porção com as mesmas calorias de `kcal`. */
export function convertFood(name: string, kcal: number): PlanFood | null {
  const entry = catalogEntry(name);
  if (!entry || entry.per100g.kcal === 0) return null;
  return foodPortion(name, Math.max(1, Math.round((kcal / entry.per100g.kcal) * 100)));
}

/** O alimento `name` numa porção de `grams` gramas, com os nutrientes do catálogo. */
export function foodPortion(name: string, grams: number): PlanFood | null {
  const entry = catalogEntry(name);
  if (!entry) return null;
  const factor = grams / 100;
  return {
    name,
    grams,
    carbs: Math.round(entry.per100g.carbs * factor),
    protein: Math.round(entry.per100g.protein * factor),
    fat: Math.round(entry.per100g.fat * factor),
    kcal: Math.round(entry.per100g.kcal * factor),
  };
}

/** Substitutos do mesmo grupo, sem o próprio alimento e sem os que o usuário também marcou. */
export function substituteOptions(foodName: string, kcal: number, feedback: Record<string, FoodFeedback>) {
  const group = catalogEntry(foodName)?.group;
  if (!group) return [];
  return foodCatalog
    .filter((food) => food.group === group && food.name !== foodName && !feedback[food.name])
    .map((food) => convertFood(food.name, kcal))
    .filter((food): food is PlanFood => food !== null);
}

/**
 * Aplica as trocas (nome → substituto; "" = sai sem substituto), seguindo a cadeia caso o
 * substituto também tenha sido trocado depois.
 */
export function resolveFoods<T extends PlanFood>(foods: T[], swaps: Record<string, string>): PlanFood[] {
  return foods.flatMap((food) => {
    let current: PlanFood = food;
    for (let i = 0; i < MAX_CHAIN && swaps[current.name] !== undefined; i++) {
      const converted = convertFood(swaps[current.name], current.kcal);
      if (!converted) return [];
      current = converted;
    }
    return [current];
  });
}

/** Se a refeição sugerida usa algum alimento restrito (o assistente evita essas sugestões). */
export function usesRestrictedFood(foods: { name: string }[], feedback: Record<string, FoodFeedback>) {
  return foods.some((food) => feedback[food.name]);
}
