// Versões do plano para o histórico: uma por montagem, com o registro do que o usuário mudou nela.
import type {
  MealSlot,
  PlanHistoryChange,
  PlanHistoryEdit,
  PlanHistoryFood,
  PlanMeal,
} from '../contract.js';
import type {
  PlanVersionMeal,
  PlanVersionTotals,
} from '../database/entities/index.js';

type VersionRef = { fingerprint: string; assembledAt: Date | null };

/**
 * O que fazer com o plano de agora: novo plano montado, a versão vira a montada do assistente (`replace`),
 * gravar a mudança na versão em vigor (`update`) ou nada.
 */
export type VersionAction = 'insert' | 'replace' | 'update' | 'none';

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
 * Regra do histórico: um plano por montagem. `assembledAt` é a montagem do assistente de agora (`null` sem ela,
 * no plano base). Uma montagem nova (o usuário pediu para refazer) cria outro plano; a primeira, depois do plano
 * base, fica no lugar dele. As mudanças do usuário entram no plano em vigor (`update`).
 */
export function nextPlanVersion(
  last: VersionRef | null,
  fingerprint: string,
  assembledAt: Date | null,
): VersionAction {
  if (!last) return 'insert';
  if (assembledAt && assembledAt.getTime() !== last.assembledAt?.getTime())
    return last.assembledAt ? 'insert' : 'replace';
  return last.fingerprint === fingerprint ? 'none' : 'update';
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

/**
 * As alterações de `before` para `after`, do dia `date` e com o horário `at` (`null` = sem horário, versões de
 * antes dele), na frente do `log` da versão: a lista fica da mais recente para a mais antiga.
 */
export function appendEdits(
  before: PlanVersionMeal[],
  after: PlanVersionMeal[],
  date: string,
  at: string | null,
  log: PlanHistoryEdit[] = [],
): PlanHistoryEdit[] {
  return [
    ...planChanges(before, after).map((change) => ({ ...change, date, at })),
    ...log,
  ];
}
