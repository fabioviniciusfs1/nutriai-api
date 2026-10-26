// Versões do plano para o histórico: o que gravar quando o plano muda e o que mudou entre duas versões.
import type {
  MealSlot,
  PlanHistoryChange,
  PlanHistoryFood,
  PlanMeal,
} from '../contract.js';
import type {
  PlanVersionMeal,
  PlanVersionTotals,
} from '../database/entities/index.js';

type VersionRef = { fingerprint: string; edited: boolean; date: string };

/** O que fazer com o plano de agora: nova versão, editar ou apagar a alterada do dia, ou nada. */
export type VersionAction = 'insert' | 'update' | 'delete' | 'none';

/** Refeições, totais e fingerprint (títulos, alimentos e gramas, sem horários) do plano. */
export function planVersion(
  meals: PlanMeal[],
  fiber: number,
): {
  meals: (PlanVersionMeal & { slot: MealSlot })[];
  totals: PlanVersionTotals;
  fingerprint: string;
} {
  const foods = meals.flatMap((meal) => meal.foods);
  const sum = (key: 'protein' | 'carbs' | 'fat') =>
    foods.reduce((total, food) => total + food[key], 0);
  return {
    meals: meals.map((meal) => ({
      id: meal.id,
      slot: meal.slot,
      title: meal.title,
      time: meal.time,
      kcal: meal.totals.kcal,
      foods: meal.foods.map(({ name, grams, units }) => ({
        name,
        grams,
        ...(units !== undefined ? { units } : {}),
      })),
    })),
    totals: {
      kcal: meals.reduce((total, meal) => total + meal.totals.kcal, 0),
      protein: sum('protein'),
      carbs: sum('carbs'),
      fat: sum('fat'),
      fiber: Math.round(fiber),
    },
    fingerprint: JSON.stringify(
      meals.map((meal) => [
        meal.id,
        meal.title,
        meal.foods.map((food) => [food.name, food.grams]),
      ]),
    ),
  };
}

/**
 * Regra do histórico: a primeira versão é a montada; depois, por dia, no máximo uma alterada, que junta as
 * mudanças daquele dia. `last` é a versão mais recente e `previous` a de antes dela.
 */
export function nextPlanVersion(
  last: VersionRef | null,
  previous: VersionRef | null,
  fingerprint: string,
  today: string,
): VersionAction {
  if (!last) return 'insert';
  if (last.fingerprint === fingerprint) return 'none';
  if (last.edited && last.date === today)
    // Desfez no mesmo dia tudo o que tinha mudado: a alterada do dia some.
    return previous?.fingerprint === fingerprint ? 'delete' : 'update';
  return 'insert';
}

/**
 * O que mudou de `previous` para `current`, refeição por refeição (pelo id). Alimentos com o mesmo nome são
 * o mesmo alimento (gramas diferentes = `grams`); os que saíram e os que entraram formam trocas, na ordem.
 */
export function planChanges(
  previous: PlanVersionMeal[],
  current: PlanVersionMeal[],
): PlanHistoryChange[] {
  const changes: PlanHistoryChange[] = [];
  const before = new Map(previous.map((meal) => [meal.id, meal]));
  for (const meal of current) {
    const old = [...(before.get(meal.id)?.foods ?? [])];
    before.delete(meal.id);
    const added: PlanHistoryFood[] = [];
    const grams: PlanHistoryChange[] = [];
    for (const food of meal.foods) {
      const index = old.findIndex((item) => item.name === food.name);
      if (index === -1) {
        added.push(food);
        continue;
      }
      const [from] = old.splice(index, 1);
      if (from.grams !== food.grams)
        grams.push({ meal: meal.title, kind: 'grams', from, to: food });
    }
    const swaps = Math.min(old.length, added.length);
    for (let i = 0; i < swaps; i++)
      changes.push({
        meal: meal.title,
        kind: 'swap',
        from: old[i],
        to: added[i],
      });
    for (const to of added.slice(swaps))
      changes.push({ meal: meal.title, kind: 'added', from: null, to });
    for (const from of old.slice(swaps))
      changes.push({ meal: meal.title, kind: 'removed', from, to: null });
    changes.push(...grams);
  }
  // Refeição que saiu do plano (a rotina mudou).
  for (const meal of before.values())
    for (const from of meal.foods)
      changes.push({ meal: meal.title, kind: 'removed', from, to: null });
  return changes;
}
