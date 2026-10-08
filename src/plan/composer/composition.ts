// Partes puras da composição de refeições pelo assistente: prompt, schema da resposta e validação.
import type { Diet, FoodFeedback } from '../../contract.js';
import { DIET_NAMES } from '../engine/diet.js';
import { FoodCatalog, normalize, sumTotals } from '../engine/foods.js';
import { mealPeriod } from '../engine/planner.js';
import type { CatalogFood, MealSuggestion, PlanFood } from '../engine/types.js';

/** Limites de uma composição válida. */
const MAX_FOODS = 8;
const MAX_GRAMS = 1000;

/** Instruções fixas (ficam em cache junto com o catálogo). */
export const COMPOSER_INSTRUCTIONS = `Você monta refeições para o NutriAI, um app brasileiro de plano alimentar.

Use somente alimentos do catálogo abaixo (Tabela TACO), copiando o nome exatamente como está. Cada linha traz
nome | grupo | kcal, proteína (P), gordura (G) e carboidrato (C) por 100 g.

Regras:
- Monte uma refeição brasileira comum e apetitosa, coerente com o nome que o usuário deu e com o horário.
- Use de 2 a 6 alimentos, em gramas de porções caseiras realistas.
- Prefira alimentos na forma em que são comidos: cozidos, grelhados ou assados; frutas e verduras cruas.
  Não use carnes, grãos, ovos ou farinhas crus.
- Busque as calorias e os macronutrientes pedidos. O app ajusta a porção total para as calorias exatas, então
  o mais importante é a proporção entre proteína, gordura e carboidrato.
- Nunca use os alimentos que o usuário marcou como restritos.
- Evite repetir os alimentos principais das outras refeições do dia, quando houver alternativas.
- "title" é um nome curto e descritivo para a refeição sugerida (ex.: "Omelete de Queijo com Salada").`;

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

/** Schema da resposta (saída estruturada). */
export const COMPOSITION_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    foods: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, grams: { type: 'integer' } },
        required: ['name', 'grams'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'foods'],
  additionalProperties: false,
} as const;

export type CompositionRequest = {
  /** Nome que o usuário deu à refeição. */
  title: string;
  time: string;
  kcal: number;
  /** Gramas de cada macro que a refeição deve trazer; `null` sem perfil. */
  macros: { protein: number; fat: number; carbs: number } | null;
  /** Alimentos restritos (não podem entrar). */
  restricted: string[];
  /** Refeições que já estão no plano de hoje (título e alimentos). */
  otherMeals: { title: string; foods: string[] }[];
  diet: Diet;
  /** Preferências do perfil em texto livre (pode ser vazio). */
  preferences: string;
};

export const PERIOD_NAMES = {
  manha: 'manhã',
  tarde: 'tarde',
  noite: 'noite',
} as const;

/** Tipo de alimentação e preferências do usuário, como linhas do prompt. */
export function preferenceLines(diet: Diet, preferences: string): string[] {
  return [
    `Tipo de alimentação: ${DIET_NAMES[diet]}.`,
    preferences.trim()
      ? `Preferências do usuário (siga quando possível): ${preferences.trim()}`
      : 'Preferências do usuário: nenhuma informada.',
  ];
}

/** Pedido do usuário para o assistente (muda a cada chamada). */
export function compositionPrompt(request: CompositionRequest): string {
  const lines = [
    `Refeição: "${request.title}", às ${request.time} (${PERIOD_NAMES[mealPeriod(request.time)]}).`,
    `Calorias: cerca de ${request.kcal} kcal.`,
  ];
  if (request.macros) {
    const { protein, fat, carbs } = request.macros;
    lines.push(
      `Macronutrientes que faltam no dia para esta refeição: ${protein} g de proteína, ${fat} g de gordura, ${carbs} g de carboidrato.`,
    );
  }
  lines.push(...preferenceLines(request.diet, request.preferences));
  lines.push(
    request.restricted.length > 0
      ? `Alimentos restritos (não use): ${request.restricted.join('; ')}.`
      : 'Alimentos restritos: nenhum.',
  );
  if (request.otherMeals.length > 0) {
    lines.push('Outras refeições de hoje:');
    for (const meal of request.otherMeals)
      lines.push(`- ${meal.title}: ${meal.foods.join('; ')}`);
  }
  return lines.join('\n');
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

/**
 * Lê a resposta do assistente e devolve a refeição na porção que ele escolheu (nutrientes calculados pelo
 * catálogo). Alimentos fora do catálogo, restritos ou fora do tipo de alimentação são descartados; `null`
 * se não sobrar nenhum.
 */
export function parseComposition(
  text: string,
  catalog: FoodCatalog,
  feedback: Record<string, FoodFeedback>,
  time: string,
  allowed: (name: string) => boolean = () => true,
): MealSuggestion | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const { title, foods } = (raw ?? {}) as { title?: unknown; foods?: unknown };
  const result = parseFoods(foods, catalog, feedback, allowed);
  if (result.length === 0) return null;
  return {
    title: parseTitle(title, 'Refeição sugerida'),
    periods: [mealPeriod(time)],
    foods: result,
  };
}
