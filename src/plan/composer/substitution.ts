// Partes puras das sugestões de substituto pelo assistente: prompt, schema da resposta e validação.
import type { Diet, FoodFeedback, MealSlot } from '../../contract.js';
import { MEAL_NAMES } from '../../users/routine.js';
import {
  FoodCatalog,
  foodFamily,
  isRaw,
  isRawStaple,
  isSameFood,
  MAX_PER_FAMILY,
} from '../engine/foods.js';
import {
  type CitedFood,
  citedFoods,
  dietLine,
  FOOD_NAMING,
  parseApprox,
  parseJson,
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
- Ordene do mais adequado para o menos adequado. O pedido traz os macronutrientes do alimento na porção e de
  onde vem a maior parte das calorias dele: sugira substitutos com proporção parecida de proteína, gordura e
  carboidrato (no lugar de uma fonte de gordura, como abacate ou azeite, outra fonte de gordura, não uma
  proteína); o app ajusta a porção para as mesmas calorias.
- Sugira alimentos na forma em que são comidos: se o alimento a substituir não é cru, nunca sugira um com
  "cru" ou "crua" no nome (ex.: troque frango grelhado por peixe grelhado ou assado, não por peixe cru).
  Frutas e verduras cruas só no lugar de outro alimento cru. Arroz, macarrão e outras massas, grãos e
  leguminosas sempre cozidos, mesmo no lugar de um alimento cru.
- Prefira alimentos in natura ou pouco processados e saudáveis para o dia a dia: nada de banha, margarina,
  gordura hidrogenada, embutidos, doces ou ultraprocessados.
- Varie: no máximo 2 do mesmo tipo de alimento (ex.: 2 óleos, 2 queijos), e o resto de outros que façam a
  mesma função (no lugar do azeite: abacate, castanhas, azeitona…).
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
  /** Alimento a substituir, com a porção de hoje e os nutrientes dela. */
  food: {
    name: string;
    grams: number;
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
  };
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

const MACRO_NAMES = {
  protein: 'proteína',
  fat: 'gordura',
  carbs: 'carboidrato',
} as const;

/** De onde vêm as calorias do alimento: o macronutriente com metade ou mais delas, ou os dois maiores. */
function caloriesSource(food: SubstituteRequest['food']): string | null {
  const kcal = [
    ['protein', food.protein * 4],
    ['fat', food.fat * 9],
    ['carbs', food.carbs * 4],
  ] as const;
  const total = kcal.reduce((sum, [, value]) => sum + value, 0);
  if (total === 0) return null;
  const [first, second] = [...kcal].sort((a, b) => b[1] - a[1]);
  const share = (value: number) => Math.round((value / total) * 100);
  return first[1] / total >= 0.5
    ? `${share(first[1])}% das calorias vêm da ${MACRO_NAMES[first[0]]}`
    : `as calorias vêm da ${MACRO_NAMES[first[0]]} (${share(first[1])}%) e da ${MACRO_NAMES[second[0]]} (${share(second[1])}%)`;
}

/** Pedido do usuário para o assistente (muda a cada chamada). */
export function substitutePrompt(request: SubstituteRequest): string {
  const { food } = request;
  const source = caloriesSource(food);
  return [
    `Substituir: "${food.name}" (${food.grams} g: ${Math.round(food.kcal)} kcal; ${Math.round(food.protein)} g de ` +
      `proteína, ${Math.round(food.fat)} g de gordura, ${Math.round(food.carbs)} g de carboidrato` +
      `${source ? `; ${source}` : ''}).`,
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

/** Os alimentos citados na resposta dos substitutos (`foods`, ou `names` só com os nomes). */
export function substituteCitedFoods(text: string): CitedFood[] {
  const { foods, names } = (parseJson(text) ?? {}) as {
    foods?: unknown;
    names?: unknown;
  };
  return citedFoods(Array.isArray(foods) ? foods : names);
}

/**
 * Lê a resposta do assistente (`foods`, ou `names` só com os nomes) e devolve os alimentos do catálogo que
 * correspondem aos citados (`FoodCatalog.match`), na ordem dele, sem o próprio alimento (nem ele em outro preparo,
 * `isSameFood`), sem restritos, sem repetidos, sem os que não passam em `allowed` (tipo de alimentação), sem
 * crus quando o alimento original não é cru, nunca com grão, massa ou leguminosa crua (`isRawStaple`) e no
 * máximo `MAX_PER_FAMILY` da mesma família, contando os já oferecidos (`offered`).
 */
export function parseSubstitutes(
  text: string,
  catalog: FoodCatalog,
  feedback: Record<string, FoodFeedback>,
  foodName: string,
  allowed: (name: string) => boolean = () => true,
  offered: string[] = [],
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
    // Grão, massa ou leguminosa crua nunca, mesmo no lugar de outro cru.
    if (isRawStaple(name)) continue;
    if (!allowed(name)) continue;
    // Variedade: no máximo `MAX_PER_FAMILY` da mesma família, contando os já oferecidos ("Ver mais").
    const family = foodFamily(name);
    if (
      [...offered, ...chosen].filter((item) => foodFamily(item) === family)
        .length >= MAX_PER_FAMILY
    )
      continue;
    chosen.add(name);
    if (chosen.size === MAX_SUBSTITUTES) break;
  }
  return [...chosen];
}
