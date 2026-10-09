// Partes puras da montagem do plano individual pelo assistente: prompt, schema da resposta e validação.
import type {
  ActivityLevel,
  Diet,
  FoodFeedback,
  Goal,
  Sex,
} from '../../contract.js';
import type { FoodCatalog } from '../engine/foods.js';
import { mealPeriod } from '../engine/planner.js';
import type { PersonalMeals } from '../engine/types.js';
import {
  dietLine,
  parseFoods,
  parseTitle,
  PERIOD_NAMES,
} from './composition.js';

/** Instruções fixas (ficam em cache junto com o catálogo). */
export const PERSONAL_PLAN_INSTRUCTIONS = `Você monta o plano alimentar diário de um usuário do NutriAI, um app brasileiro de plano alimentar.

Use somente alimentos do catálogo abaixo (Tabela TACO), copiando o nome exatamente como está. Cada linha traz
nome | grupo | kcal, proteína (P), gordura (G) e carboidrato (C) por 100 g.

Regras:
- Monte cada refeição pedida (pelo id), com refeições brasileiras comuns, apetitosas e práticas, adequadas ao
  horário e ao objetivo do usuário. O dia deve ser variado: não repita o alimento principal entre refeições.
- Use de 2 a 6 alimentos por refeição, em gramas de porções caseiras realistas.
- Prefira alimentos na forma em que são comidos: cozidos, grelhados ou assados; frutas e verduras cruas.
  Não use carnes, grãos, ovos ou farinhas crus (massas secas, como macarrão, podem vir pelo peso cru).
- É um plano para o dia a dia: prefira alimentos in natura ou pouco processados. Evite doces, bolos,
  biscoitos, refrigerantes e ultraprocessados, principalmente se o objetivo é perder peso.
- Distribua a proteína ao longo do dia, com uma fonte de proteína em cada refeição principal.
- Busque as calorias e os macronutrientes de cada refeição. O app ajusta as porções do dia para a meta exata,
  então o mais importante é a proporção entre proteína, gordura e carboidrato.
- O tipo de alimentação é obrigatório: nunca use alimentos que ele exclui.
- Siga as preferências do usuário (gostos, rotina, intolerâncias) sempre que possível.
- Nunca use os alimentos que o usuário marcou como restritos.
- "title" é um nome curto e descritivo para cada refeição (ex.: "Omelete de Queijo com Salada").`;

/** Schema da resposta (saída estruturada). */
export const PERSONAL_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    meals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string' },
          foods: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                grams: { type: 'integer' },
              },
              required: ['name', 'grams'],
              additionalProperties: false,
            },
          },
        },
        required: ['id', 'title', 'foods'],
        additionalProperties: false,
      },
    },
  },
  required: ['meals'],
  additionalProperties: false,
} as const;

type Macros = { protein: number; fat: number; carbs: number };

export type PersonalPlanRequest = {
  profile: {
    sex: Sex;
    age: number;
    weightKg: number;
    heightCm: number;
    activityLevel: ActivityLevel;
    goal: Goal;
  };
  /** Meta do dia. */
  day: Macros & { kcal: number };
  /** Refeições a montar (ids do plano base), com horário e metas de cada uma. */
  meals: (Macros & { id: number; time: string; kcal: number })[];
  diet: Diet;
  /** Alimentos restritos (não podem entrar). */
  restricted: string[];
};

const ACTIVITY_NAMES: Record<ActivityLevel, string> = {
  sedentario: 'sedentário',
  leve: 'levemente ativo',
  moderado: 'moderadamente ativo',
  intenso: 'muito ativo',
  extremo: 'extremamente ativo',
};

const GOAL_NAMES: Record<Goal, string> = {
  perder: 'perder peso',
  manter: 'manter o peso',
  ganhar: 'ganhar peso',
};

/** Papel da refeição pelo horário (café da manhã, almoço…), para o assistente. */
export function mealRole(time: string) {
  if (time < '10:00') return 'café da manhã';
  if (time < '11:30') return 'lanche da manhã';
  if (time < '15:00') return 'almoço';
  if (time < '18:30') return 'lanche da tarde';
  if (time < '21:30') return 'jantar';
  return 'ceia';
}

const macrosText = ({ protein, fat, carbs }: Macros) =>
  `${protein} g de proteína, ${fat} g de gordura, ${carbs} g de carboidrato`;

/** Pedido para o assistente (muda a cada usuário). */
export function personalPlanPrompt(request: PersonalPlanRequest): string {
  const { profile, day } = request;
  const lines = [
    `Usuário: sexo ${profile.sex}, ${profile.age} anos, ${profile.weightKg} kg, ${profile.heightCm} cm, ` +
      `${ACTIVITY_NAMES[profile.activityLevel]}, objetivo ${GOAL_NAMES[profile.goal]}.`,
    `Meta do dia: ${day.kcal} kcal (${macrosText(day)}).`,
    dietLine(request.diet),
    request.restricted.length > 0
      ? `Alimentos restritos (não use): ${request.restricted.join('; ')}.`
      : 'Alimentos restritos: nenhum.',
    'Refeições a montar:',
    ...request.meals.map(
      (meal) =>
        `- id ${meal.id}: ${mealRole(meal.time)}, às ${meal.time} (${PERIOD_NAMES[mealPeriod(meal.time)]}), ` +
        `cerca de ${meal.kcal} kcal (${macrosText(meal)}).`,
    ),
  ];
  return lines.join('\n');
}

/**
 * Lê a resposta do assistente e devolve as refeições pedidas (`ids`), cada uma na porção dele com os nutrientes
 * do catálogo. Alimentos fora do catálogo, restritos ou fora do tipo de alimentação são descartados; `null` se
 * alguma refeição pedida não vier ou ficar sem alimentos.
 */
export function parsePersonalPlan(
  text: string,
  catalog: FoodCatalog,
  feedback: Record<string, FoodFeedback>,
  allowed: (name: string) => boolean,
  ids: number[],
): PersonalMeals | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const { meals } = (raw ?? {}) as { meals?: unknown };
  if (!Array.isArray(meals)) return null;

  const result: PersonalMeals = {};
  for (const meal of meals as {
    id?: unknown;
    title?: unknown;
    foods?: unknown;
  }[]) {
    if (typeof meal?.id !== 'number' || !ids.includes(meal.id)) continue;
    if (result[meal.id]) continue;
    const foods = parseFoods(meal.foods, catalog, feedback, allowed);
    if (foods.length === 0) continue;
    result[meal.id] = { title: parseTitle(meal.title, 'Refeição'), foods };
  }
  return ids.every((id) => result[id]) ? result : null;
}
