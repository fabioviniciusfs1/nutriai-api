// Partes puras comuns aos pedidos ao assistente (plano individual e substitutos): catálogo no prompt e
// validação dos alimentos que ele devolve.
import type { Diet, FoodFeedback } from '../../contract.js';
import { DIET_NAMES } from '../engine/diet.js';
import { FoodCatalog, normalize, sumTotals } from '../engine/foods.js';
import type { CatalogFood, PlanFood } from '../engine/types.js';

/** Limites de uma refeição válida. */
const MAX_FOODS = 8;
const MAX_GRAMS = 1000;

/** Catálogo no formato do prompt: uma linha por alimento. */
export function catalogPrompt(foods: CatalogFood[]): string {
  const value = (n: number) => String(Math.round(n * 10) / 10);
  return foods
    .map(
      ({ name, group, per100g }) =>
        `${name} | ${group ?? 'outros'} | ${value(per100g.kcal)} kcal, P ${value(per100g.protein)}, G ${value(per100g.fat)}, C ${value(per100g.carbs)}`,
    )
    .join('\n');
}

export const PERIOD_NAMES = {
  manha: 'manhã',
  tarde: 'tarde',
  noite: 'noite',
} as const;

/** Tipo de alimentação do usuário, como linha do prompt. */
export function dietLine(diet: Diet): string {
  return `Tipo de alimentação: ${DIET_NAMES[diet]}.`;
}

/**
 * Alimentos que o assistente escolheu, na porção dele (nutrientes calculados pelo catálogo). Nomes fora do
 * catálogo, restritos ou que não passam em `allowed` (tipo de alimentação) são descartados; repetidos somam.
 */
export function parseFoods(
  items: unknown,
  catalog: FoodCatalog,
  feedback: Record<string, FoodFeedback>,
  allowed: (name: string) => boolean = () => true,
): PlanFood[] {
  if (!Array.isArray(items)) return [];
  const byNormalizedName = new Map(
    catalog.foods.map((food) => [normalize(food.name), food.name]),
  );
  const chosen = new Map<string, PlanFood>();
  for (const item of items.slice(0, MAX_FOODS) as {
    name?: unknown;
    grams?: unknown;
  }[]) {
    if (typeof item?.name !== 'string' || typeof item.grams !== 'number')
      continue;
    const name = catalog.entry(item.name)
      ? item.name
      : byNormalizedName.get(normalize(item.name));
    if (!name || feedback[name] || !allowed(name)) continue;
    const grams = Math.min(MAX_GRAMS, Math.max(1, Math.round(item.grams)));
    // Alimento repetido: soma as gramas.
    const previous = chosen.get(name)?.grams ?? 0;
    const portion = catalog.portion(
      name,
      Math.min(MAX_GRAMS, previous + grams),
    );
    if (portion) chosen.set(name, portion);
  }
  const result = [...chosen.values()];
  return sumTotals(result).kcal === 0 ? [] : result;
}

/** Título curto do assistente, ou `fallback` se vier vazio. */
export function parseTitle(title: unknown, fallback: string) {
  return typeof title === 'string' && title.trim()
    ? title.trim().slice(0, 80)
    : fallback;
}
