// Partes puras comuns aos pedidos ao assistente (plano individual e substitutos): como ele nomeia os
// alimentos e a validação dos que ele devolve. Ele não vê o catálogo: cita os alimentos e a API acha cada um
// no catálogo (`FoodCatalog.match`).
import type { Diet, FoodFeedback } from '../../contract.js';
import { DIET_NAMES } from '../engine/diet.js';
import { type ApproxPer100g, FoodCatalog, sumTotals } from '../engine/foods.js';
import type { PlanFood } from '../engine/types.js';

/** Limites de uma refeição válida. */
const MAX_FOODS = 8;
const MAX_GRAMS = 1000;

/** Como nomear os alimentos (vai nas instruções dos dois pedidos). */
export const FOOD_NAMING = `Os alimentos são conferidos nas tabelas brasileiras de composição de alimentos (TACO e TBCA). Para cada
alimento, informe:
- "name": o nome no estilo dessas tabelas, do geral para o específico, separado por vírgulas e com a forma
  de preparo, sem marcas (ex.: "Arroz, integral, cozido", "Frango, peito, sem pele, grelhado", "Feijão,
  carioca, cozido", "Banana, prata, crua", "Pão, trigo, francês", "Ovo, de galinha, inteiro, cozido").
  Um alimento por item: em vez de um prato pronto, liste os ingredientes principais.
- "per100g": kcal, proteína (protein), gordura (fat) e carboidrato (carbs) aproximados por 100 g do alimento
  como descrito (só ajudam a achar o alimento certo na tabela).`;

/** Schema de `per100g` (saída estruturada). */
export const PER100G_SCHEMA = {
  type: 'object',
  properties: {
    kcal: { type: 'number' },
    protein: { type: 'number' },
    fat: { type: 'number' },
    carbs: { type: 'number' },
  },
  required: ['kcal', 'protein', 'fat', 'carbs'],
  additionalProperties: false,
} as const;

/** `per100g` do assistente, só com os números válidos. */
export function parseApprox(value: unknown): ApproxPer100g | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const approx: ApproxPer100g = {};
  for (const key of ['kcal', 'protein', 'fat', 'carbs'] as const) {
    const item = (value as Record<string, unknown>)[key];
    if (typeof item === 'number' && Number.isFinite(item) && item >= 0)
      approx[key] = item;
  }
  return approx;
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
 * Alimentos que o assistente escolheu, na porção dele, cada um trocado pelo do catálogo (`FoodCatalog.match`,
 * com os nutrientes do catálogo). Os que não estão no catálogo, restritos ou que não passam em `allowed`
 * (tipo de alimentação) são descartados; repetidos somam.
 */
export function parseFoods(
  items: unknown,
  catalog: FoodCatalog,
  feedback: Record<string, FoodFeedback>,
  allowed: (name: string) => boolean = () => true,
): PlanFood[] {
  if (!Array.isArray(items)) return [];
  const chosen = new Map<string, PlanFood>();
  for (const item of items.slice(0, MAX_FOODS) as {
    name?: unknown;
    grams?: unknown;
    per100g?: unknown;
  }[]) {
    if (typeof item?.name !== 'string' || typeof item.grams !== 'number')
      continue;
    const name = catalog.match(item.name, parseApprox(item.per100g));
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
