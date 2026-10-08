// Partes puras das sugestões de substituto pelo assistente: prompt, schema da resposta e validação.
import type { FoodFeedback } from '../../contract.js';
import { FoodCatalog, isRaw, normalize } from '../engine/foods.js';
import { mealPeriod, MAX_SUBSTITUTES } from '../engine/planner.js';

/** Instruções fixas (ficam em cache junto com o catálogo). */
export const SUBSTITUTE_INSTRUCTIONS = `Você sugere substitutos de alimentos para o NutriAI, um app brasileiro de plano alimentar.

Use somente alimentos do catálogo abaixo (Tabela TACO), copiando o nome exatamente como está. Cada linha traz
nome | grupo | kcal, proteína (P), gordura (G) e carboidrato (C) por 100 g.

Regras:
- Sugira até ${MAX_SUBSTITUTES} alimentos que possam ocupar o lugar do alimento informado naquela refeição: com a
  mesma função no prato (ex.: a proteína do almoço, a fruta do lanche, o pão do café) e combinando com o horário
  e com os outros alimentos da refeição.
- Ordene do mais adequado para o menos adequado. Prefira substitutos com proporção parecida de proteína,
  gordura e carboidrato; o app ajusta a porção para as mesmas calorias.
- Sugira alimentos na forma em que são comidos: se o alimento a substituir não é cru, nunca sugira um com
  "cru" ou "crua" no nome (ex.: troque frango grelhado por peixe grelhado ou assado, não por peixe cru).
  Frutas e verduras cruas só no lugar de outro alimento cru.
- Nunca sugira o próprio alimento nem os alimentos que o usuário marcou como restritos.`;

/** Schema da resposta (saída estruturada). */
export const SUBSTITUTES_SCHEMA = {
  type: 'object',
  properties: {
    names: { type: 'array', items: { type: 'string' } },
  },
  required: ['names'],
  additionalProperties: false,
} as const;

export type SubstituteRequest = {
  /** Alimento a substituir, com a porção de hoje. */
  food: { name: string; grams: number };
  mealTitle: string;
  time: string;
  /** Os outros alimentos da refeição. */
  mealFoods: string[];
  /** Alimentos restritos (não podem ser sugeridos). */
  restricted: string[];
};

const PERIOD_NAMES = {
  manha: 'manhã',
  tarde: 'tarde',
  noite: 'noite',
} as const;

/** Pedido do usuário para o assistente (muda a cada chamada). */
export function substitutePrompt(request: SubstituteRequest): string {
  return [
    `Substituir: "${request.food.name}" (${request.food.grams} g).`,
    `Refeição: "${request.mealTitle}", às ${request.time} (${PERIOD_NAMES[mealPeriod(request.time)]}).`,
    request.mealFoods.length > 0
      ? `Outros alimentos da refeição: ${request.mealFoods.join('; ')}.`
      : 'Outros alimentos da refeição: nenhum.',
    request.restricted.length > 0
      ? `Alimentos restritos (não sugira): ${request.restricted.join('; ')}.`
      : 'Alimentos restritos: nenhum.',
  ].join('\n');
}

/**
 * Lê a resposta do assistente e devolve os nomes que existem no catálogo (exatos ou sem diferença de
 * acentos/maiúsculas), na ordem dele, sem o próprio alimento, sem restritos, sem repetidos e sem crus
 * quando o alimento original não é cru.
 */
export function parseSubstitutes(
  text: string,
  catalog: FoodCatalog,
  feedback: Record<string, FoodFeedback>,
  foodName: string,
): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const { names } = (raw ?? {}) as { names?: unknown };
  if (!Array.isArray(names)) return [];

  const byNormalizedName = new Map(
    catalog.foods.map((food) => [normalize(food.name), food.name]),
  );
  const chosen = new Set<string>();
  for (const item of names) {
    if (typeof item !== 'string') continue;
    const name = catalog.entry(item)
      ? item
      : byNormalizedName.get(normalize(item));
    if (!name || name === foodName || feedback[name]) continue;
    if (isRaw(name) && !isRaw(foodName)) continue;
    chosen.add(name);
    if (chosen.size === MAX_SUBSTITUTES) break;
  }
  return [...chosen];
}
