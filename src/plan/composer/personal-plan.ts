// Partes puras da montagem do plano individual pelo assistente: prompt, schema da resposta e validação.
import type {
  ActivityLevel,
  FoodFeedback,
  Goal,
  MealSlot,
  Routine,
  Sex,
} from '../../contract.js';
import { MEAL_NAMES, routineLines } from '../../users/routine.js';
import type { FoodCatalog } from '../engine/foods.js';
import type { PersonalMeals } from '../engine/types.js';
import {
  dietLine,
  FOOD_NAMING,
  parseFoods,
  parseTitle,
  PER100G_SCHEMA,
} from './composition.js';

/** Instruções fixas (ficam em cache). */
export const PERSONAL_PLAN_INSTRUCTIONS = `Você monta o plano alimentar diário de um usuário do NutriAI, um app brasileiro de plano alimentar.

${FOOD_NAMING}

Regras:
- Monte cada refeição pedida (pelo id), com refeições brasileiras comuns, apetitosas e práticas, adequadas ao
  horário e ao objetivo do usuário. O dia deve ser variado: não repita o alimento principal entre refeições.
- Escolha o horário de cada refeição ("time", no formato HH:MM, com minutos múltiplos de 5) dentro dos horários
  em que o usuário pode comer, em ordem ao longo do dia, sem repetir horário e, quando esses horários
  permitirem, com pelo menos 2 horas entre uma refeição e outra. Entre uma refeição e a seguinte, no máximo 6
  horas; se 6 horas depois de uma refeição o usuário não puder comer, a próxima fica no início do próximo horário
  em que ele pode comer. Cada id é a refeição indicada no pedido (café
  da manhã, lanche, almoço, jantar, ceia): monte um prato próprio dela, no horário que combine com ela.
- Distribua as calorias do dia pela rotina: refeições maiores no período em que o usuário disse sentir mais fome
  e menores no período em que disse sentir menos. Se ele não tem um período com mais ou menos fome, mantenha
  o tamanho usual de cada tipo de refeição (principais maiores que lanches e ceia), sem concentrar o dia numa só.
  Se ele treina, deixe uma refeição com carboidrato e proteína até 2 horas antes ou depois do treino. Perto da
  hora de dormir, a refeição deve ser leve.
- Use de 2 a 6 alimentos por refeição, em gramas de porções caseiras realistas.
- Prefira alimentos na forma em que são comidos: cozidos, grelhados ou assados; frutas e verduras cruas.
  Não use carnes, grãos, ovos ou farinhas crus (massas secas, como macarrão, podem vir pelo peso cru).
- É um plano para o dia a dia: prefira alimentos in natura ou pouco processados. Evite doces, bolos,
  biscoitos, refrigerantes e ultraprocessados, principalmente se o objetivo é perder peso.
- Distribua a proteína ao longo do dia, com uma fonte de proteína em cada refeição principal.
- A soma do dia deve ficar perto da meta de calorias e macronutrientes. O app ajusta as porções do dia para a
  meta exata, então o mais importante é a proporção entre as refeições e entre proteína, gordura e carboidrato.
- O tipo de alimentação é obrigatório: nunca use alimentos que ele exclui.
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
          time: { type: 'string' },
          foods: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                grams: { type: 'integer' },
                per100g: PER100G_SCHEMA,
              },
              required: ['name', 'grams', 'per100g'],
              additionalProperties: false,
            },
          },
        },
        required: ['id', 'title', 'time', 'foods'],
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
  /** Refeições a montar (ids do plano base), na ordem do dia; o assistente escolhe o horário de cada uma. */
  meals: { id: number; slot: MealSlot }[];
  routine: Routine;
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

const macrosText = ({ protein, fat, carbs }: Macros) =>
  `${protein} g de proteína, ${fat} g de gordura, ${carbs} g de carboidrato`;

/** Pedido para o assistente (muda a cada usuário). */
export function personalPlanPrompt(request: PersonalPlanRequest): string {
  const { profile, day } = request;
  const lines = [
    `Usuário: sexo ${profile.sex}, ${profile.age} anos, ${profile.weightKg} kg, ${profile.heightCm} cm, ` +
      `${ACTIVITY_NAMES[profile.activityLevel]}, objetivo ${GOAL_NAMES[profile.goal]}.`,
    `Meta do dia: ${day.kcal} kcal (${macrosText(day)}).`,
    dietLine(request.routine.diet),
    ...routineLines(request.routine),
    request.restricted.length > 0
      ? `Alimentos restritos (não use): ${request.restricted.join('; ')}.`
      : 'Alimentos restritos: nenhum.',
    'Refeições a montar:',
    ...request.meals.map(({ id, slot }) => `- id ${id}: ${MEAL_NAMES[slot]}`),
  ];
  return lines.join('\n');
}

type EatingWindow = Routine['eatingWindows'][number];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const timeOf = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/**
 * `count` horários espalhados por igual pelo tempo das janelas (em ordem), arredondados para 5 minutos sem sair
 * da janela. Usado quando os horários do assistente não servem.
 */
export function spreadMealTimes(
  windows: EatingWindow[],
  count: number,
): string[] {
  const spans = windows.map(({ start, end }) => ({
    start: minutes(start),
    end: minutes(end),
  }));
  const total = spans.reduce((sum, span) => sum + span.end - span.start, 0);
  return Array.from({ length: count }, (_, index) => {
    let offset = ((index + 0.5) / count) * total;
    const span =
      spans.find((item) => {
        if (offset <= item.end - item.start) return true;
        offset -= item.end - item.start;
        return false;
      }) ?? spans[spans.length - 1];
    const rounded = Math.round((span.start + offset) / 5) * 5;
    return timeOf(Math.min(span.end, Math.max(span.start, rounded)));
  });
}

/** No máximo 6 horas entre uma refeição e a seguinte (o sono da noite não conta). */
export const MAX_FASTING_MINUTES = 6 * 60;

/**
 * Até quando (em minutos do dia) deve vir a refeição seguinte a uma às `time`: 6 horas depois, se nesse horário
 * o usuário pode comer; senão, o início da primeira janela depois disso (as janelas não permitem antes).
 * `null` se não há janela depois (não haveria onde pôr outra refeição).
 */
export function nextMealDeadline(
  time: string,
  windows: EatingWindow[],
): number | null {
  const limit = minutes(time) + MAX_FASTING_MINUTES;
  const spans = windows.map(({ start, end }) => ({
    start: minutes(start),
    end: minutes(end),
  }));
  if (spans.some(({ start, end }) => start <= limit && limit <= end))
    return limit;
  const later = spans
    .filter(({ start }) => start > limit)
    .map(({ start }) => start);
  return later.length > 0 ? Math.min(...later) : null;
}

/** Cada refeição (na ordem dos horários) fica até o prazo da anterior (`nextMealDeadline`). */
export function withinFastingLimit(
  times: string[],
  windows: EatingWindow[],
): boolean {
  const sorted = [...times].sort();
  return sorted.every((time, index) => {
    if (index === 0) return true;
    const deadline = nextMealDeadline(sorted[index - 1], windows);
    return deadline === null || minutes(time) <= deadline;
  });
}

/**
 * Puxa para mais cedo, na ordem, cada horário que passa do prazo da refeição anterior (o prazo sempre cai numa
 * janela). Só adianta horários e nunca para antes do anterior: a ordem e os horários distintos se mantêm.
 */
export function fitFastingLimit(
  times: string[],
  windows: EatingWindow[],
): string[] {
  const result = [...times];
  for (let index = 1; index < result.length; index++) {
    const deadline = nextMealDeadline(result[index - 1], windows);
    if (deadline !== null && minutes(result[index]) > deadline)
      result[index] = timeOf(deadline);
  }
  return result;
}

/**
 * Lê a resposta do assistente e devolve as refeições pedidas (`ids`), cada uma na porção dele com os alimentos
 * e os nutrientes do catálogo (`parseFoods`). Alimentos fora do catálogo, restritos ou fora do tipo de alimentação são descartados; `null` se
 * alguma refeição pedida não vier ou ficar sem alimentos. Se algum horário vier inválido, repetido ou fora das
 * `windows`, ou se passar de 6 horas entre uma refeição e a seguinte quando as janelas permitem menos
 * (`withinFastingLimit`), todas ficam com horários espalhados pelas janelas, na ordem de `ids` (a do dia), sem
 * passar desse limite.
 */
export function parsePersonalPlan(
  text: string,
  catalog: FoodCatalog,
  feedback: Record<string, FoodFeedback>,
  allowed: (name: string) => boolean,
  ids: number[],
  windows: EatingWindow[],
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
  const times: Record<number, string> = {};
  for (const meal of meals as {
    id?: unknown;
    title?: unknown;
    time?: unknown;
    foods?: unknown;
  }[]) {
    if (typeof meal?.id !== 'number' || !ids.includes(meal.id)) continue;
    if (result[meal.id]) continue;
    const foods = parseFoods(meal.foods, catalog, feedback, allowed);
    if (foods.length === 0) continue;
    result[meal.id] = { title: parseTitle(meal.title, 'Refeição'), foods };
    times[meal.id] = typeof meal.time === 'string' ? meal.time : '';
  }
  if (!ids.every((id) => result[id])) return null;

  const valid =
    new Set(Object.values(times)).size === ids.length &&
    Object.values(times).every(
      (time) =>
        TIME.test(time) &&
        windows.some(({ start, end }) => start <= time && time <= end),
    ) &&
    withinFastingLimit(Object.values(times), windows);
  if (!valid) {
    const spread = fitFastingLimit(
      spreadMealTimes(windows, ids.length),
      windows,
    );
    ids.forEach((id, index) => (times[id] = spread[index]));
  }
  for (const id of ids) result[id].time = times[id];
  return result;
}
