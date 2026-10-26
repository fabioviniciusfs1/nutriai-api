// Partes puras das sugestões de substituto pelo assistente: prompt, schema da resposta e validação.
import type { Diet, FoodFeedback, MealSlot } from '../../contract.js';
import { MEAL_NAMES } from '../../users/routine.js';
import { FoodCatalog, isRaw, isSameFood } from '../engine/foods.js';
import {
  dietLine,
  FOOD_NAMING,
  parseApprox,
  PER100G_SCHEMA,
  PERIOD_NAMES,
} from './composition.js';
import { mealPeriod, MAX_SUBSTITUTES } from '../engine/planner.js';

/** Instruções fixas (ficam em cache). */
export const SUBSTITUTE_INSTRUCTIONS = `Você sugere substitutos de alimentos para o NutriAI, um app brasileiro de plano alimentar.

${FOOD_NAMING}

Regras:
- Sugira até ${MAX_SUBSTITUTES} alimentos que possam ocupar o lugar do alimento informado naquela refeição: com a
  mesma função no prato (ex.: a proteína do almoço, a fruta do lanche, o pão do café) e combinando com o horário
  e com os outros alimentos da refeição.
- Ordene do mais adequado para o menos adequado. Prefira substitutos com proporção parecida de proteína,
  gordura e carboidrato; o app ajusta a porção para as mesmas calorias.
- Sugira alimentos na forma em que são comidos: se o alimento a substituir não é cru, nunca sugira um com
  "cru" ou "crua" no nome (ex.: troque frango grelhado por peixe grelhado ou assado, não por peixe cru).
  Frutas e verduras cruas só no lugar de outro alimento cru.
- Nunca sugira o próprio alimento, nem ele em outro preparo (para batata-doce cozida, nada de batata-doce
  assada ou frita), nem os alimentos que o usuário marcou como restritos.`;

/** Schema da resposta (saída estruturada). */
export const SUBSTITUTES_SCHEMA = {
  type: 'object',
  properties: {
    foods: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, per100g: PER100G_SCHEMA },
        required: ['name', 'per100g'],
        additionalProperties: false,
      },
    },
  },
  required: ['foods'],
  additionalProperties: false,
} as const;

export type SubstituteRequest = {
  /** Alimento a substituir, com a porção de hoje. */
  food: { name: string; grams: number };
  /** Que refeição do dia é (almoço, jantar…). */
  slot: MealSlot;
  mealTitle: string;
  time: string;
  /** Os outros alimentos da refeição. */
  mealFoods: string[];
  /** Alimentos restritos (não podem ser sugeridos). */
  restricted: string[];
  diet: Diet;
  /** Substitutos já mostrados ao usuário ("Ver mais"): não podem se repetir. */
  exclude: string[];
};

/** Pedido do usuário para o assistente (muda a cada chamada). */
export function substitutePrompt(request: SubstituteRequest): string {
  return [
    `Substituir: "${request.food.name}" (${request.food.grams} g).`,
    `Refeição: ${MEAL_NAMES[request.slot]}, "${request.mealTitle}", às ${request.time} (${PERIOD_NAMES[mealPeriod(request.time)]}).`,
    request.mealFoods.length > 0
      ? `Outros alimentos da refeição: ${request.mealFoods.join('; ')}.`
      : 'Outros alimentos da refeição: nenhum.',
    dietLine(request.diet),
    request.restricted.length > 0
      ? `Alimentos restritos (não sugira): ${request.restricted.join('; ')}.`
      : 'Alimentos restritos: nenhum.',
    ...(request.exclude.length > 0
      ? [
          `Já oferecidos ao usuário (não repita): ${request.exclude.join('; ')}.`,
        ]
      : []),
  ].join('\n');
}

/**
 * Lê a resposta do assistente (`foods`, ou `names` só com os nomes) e devolve os alimentos do catálogo que
 * correspondem aos citados (`FoodCatalog.match`), na ordem dele, sem o próprio alimento (nem ele em outro preparo,
 * `isSameFood`), sem restritos, sem repetidos, sem os que não passam em `allowed` (tipo de alimentação) e sem
 * crus quando o alimento original não é cru.
 */
export function parseSubstitutes(
  text: string,
  catalog: FoodCatalog,
  feedback: Record<string, FoodFeedback>,
  foodName: string,
  allowed: (name: string) => boolean = () => true,
): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const { foods, names } = (raw ?? {}) as { foods?: unknown; names?: unknown };
  const items = Array.isArray(foods) ? foods : names;
  if (!Array.isArray(items)) return [];

  const chosen = new Set<string>();
  for (const item of items as unknown[]) {
    const cited =
      typeof item === 'string'
        ? { name: item }
        : (item as { name?: unknown; per100g?: unknown } | null);
    if (typeof cited?.name !== 'string') continue;
    const name = catalog.match(cited.name, parseApprox(cited.per100g));
    if (!name || name === foodName || feedback[name]) continue;
    // O mesmo alimento em outro preparo não é substituto.
    if (isSameFood(foodName, name)) continue;
    if (isRaw(name) && !isRaw(foodName)) continue;
    if (!allowed(name)) continue;
    chosen.add(name);
    if (chosen.size === MAX_SUBSTITUTES) break;
  }
  return [...chosen];
}
