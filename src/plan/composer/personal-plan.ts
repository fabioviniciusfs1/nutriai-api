// Partes puras da montagem do plano individual pelo assistente: prompt, schema da resposta e validação.
import type {
  ActivityLevel,
  FoodFeedback,
  Goal,
  MealSlot,
  Sex,
} from '../../contract.js';
import {
  type DayRoutine,
  MEAL_NAMES,
  routineLines,
} from '../../users/routine.js';
import {
  type FoodCatalog,
  isRawStaple,
  isWholeGrain,
} from '../engine/foods.js';
import { PERIOD_SHARES, SLOT_PERIODS } from '../engine/planner.js';
import type { PersonalMeals } from '../engine/types.js';
import {
  type CitedFood,
  citedFoods,
  dietLine,
  FOOD_NAMING,
  parseFoods,
  parseJson,
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
  em que o usuário pode começar uma refeição (ela dura até 30 minutos e termina pelo menos 30 minutos antes do
  fim do horário em que ele pode comer), em ordem ao longo do dia, sem repetir horário e, quando esses horários
  permitirem, com pelo menos 2 horas entre uma refeição e outra. Entre uma refeição e a seguinte, no máximo 6
  horas; se 6 horas depois de uma refeição o usuário não puder comer, a próxima fica no início do próximo horário
  em que ele pode começar uma refeição. Cada id é a refeição indicada no pedido (café
  da manhã, lanche, almoço, jantar, ceia): monte um prato próprio dela, no horário que combine com ela.
- Cada refeição do pedido vem com a meta dela (kcal e gramas de proteína, gordura e carboidrato): monte as
  porções para chegar perto dessa meta, conferindo pelos valores por 100 g que você informa (gramas × valor /
  100). Ela vem das calorias do dia divididas em 35% de manhã (café da manhã e lanche da manhã), 40% à tarde
  (almoço e lanche da tarde) e 25% à noite (jantar e ceia), com o lanche do período em partes iguais com a
  refeição principal, e dos macros do dia na mesma proporção.
  Se ele treina, deixe uma refeição com carboidrato e proteína até 2 horas antes ou depois do treino. Perto da
  hora de dormir, a refeição deve ser leve.
- Use de 2 a 6 alimentos por refeição, em gramas de porções caseiras realistas.
- Prefira alimentos na forma em que são comidos: cozidos, grelhados ou assados; frutas e verduras cruas.
  Não use carnes, grãos, ovos ou farinhas crus. Arroz, macarrão e outras massas, grãos e leguminosas vão
  sempre cozidos, com as gramas já cozidas.
- Não use as versões integrais de pão, arroz, macarrão, torrada ou biscoito: use as comuns (ex.: pão
  francês, arroz branco tipo 1, macarrão comum).
- É um plano para o dia a dia: prefira alimentos in natura ou pouco processados. Evite doces, bolos,
  biscoitos, refrigerantes e ultraprocessados, principalmente se o objetivo é perder peso.
- Distribua a proteína ao longo do dia, com uma fonte de proteína em cada refeição principal.
- A soma do dia deve ficar perto da meta de calorias e macronutrientes. O app ainda ajusta as porções para a
  meta exata, mas, quanto mais perto você chegar em cada refeição, menos ele muda as porções que você escolheu.
- O tipo de alimentação é obrigatório: nunca use alimentos que ele exclui.
- Nunca use os alimentos que o usuário marcou como restritos.
- "title" é um nome curto e descritivo para cada refeição (ex.: "Omelete de Queijo com Salada").`;

/**
 * Alimentos que podem entrar no plano individual: os que passam em `allowed` (tipo de alimentação), sem grão,
 * massa ou leguminosa crua (`isRawStaple`) e sem versão integral de pão, arroz, massa… (`isWholeGrain`).
 */
export function planAllows(
  catalog: FoodCatalog,
  allowed: (name: string) => boolean,
) {
  return (name: string) =>
    allowed(name) && !isRawStaple(name) && !isWholeGrain(catalog.entry(name));
}

/** Todos os alimentos citados na resposta do plano individual (`meals[].foods`). */
export function personalPlanCitedFoods(text: string): CitedFood[] {
  const { meals } = (parseJson(text) ?? {}) as { meals?: unknown };
  return Array.isArray(meals)
    ? (meals as { foods?: unknown }[]).flatMap((meal) =>
        citedFoods(meal?.foods),
      )
    : [];
}

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
  /** A rotina do grupo de dias do plano. */
  routine: DayRoutine;
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

/** O usuário em uma linha: sexo, idade, peso, altura, atividade e objetivo. */
export function profileLine(profile: PersonalPlanRequest['profile']): string {
  return (
    `Usuário: sexo ${profile.sex}, ${profile.age} anos, ${profile.weightKg} kg, ${profile.heightCm} cm, ` +
    `${ACTIVITY_NAMES[profile.activityLevel]}, objetivo ${GOAL_NAMES[profile.goal]}.`
  );
}

/**
 * A meta de cada refeição: a parte dela das calorias do dia (a do período em `PERIOD_SHARES`, em partes iguais
 * entre a refeição principal e o lanche, como no `Planner`; um período sem refeição passa a parte dele para os
 * outros) e os macros do dia na mesma proporção. Calorias em dezenas, gramas inteiras.
 */
export function mealTargets(
  day: PersonalPlanRequest['day'],
  meals: PersonalPlanRequest['meals'],
): (Macros & { kcal: number })[] {
  const count = (slot: MealSlot) =>
    meals.filter((meal) => SLOT_PERIODS[meal.slot] === SLOT_PERIODS[slot])
      .length;
  const shares = meals.map(
    ({ slot }) => PERIOD_SHARES[SLOT_PERIODS[slot]] / count(slot),
  );
  const total = shares.reduce((sum, share) => sum + share, 0) || 1;
  return shares.map((share) => {
    const part = share / total;
    return {
      kcal: Math.round((day.kcal * part) / 10) * 10,
      protein: Math.round(day.protein * part),
      fat: Math.round(day.fat * part),
      carbs: Math.round(day.carbs * part),
    };
  });
}

/** Pedido para o assistente (muda a cada usuário). */
export function personalPlanPrompt(request: PersonalPlanRequest): string {
  const { profile, day } = request;
  const lines = [
    profileLine(profile),
    `Meta do dia: ${day.kcal} kcal (${macrosText(day)}).`,
    dietLine(request.routine.diet),
    ...routineLines(request.routine),
    `Horários em que pode começar uma refeição: ${mealStartWindows(
      request.routine.eatingWindows,
    )
      .map(({ start, end }) => `${start}–${end}`)
      .join(', ')}.`,
    request.restricted.length > 0
      ? `Alimentos restritos (não use): ${request.restricted.join('; ')}.`
      : 'Alimentos restritos: nenhum.',
    'Refeições a montar (com a meta de cada uma):',
    ...mealTargets(day, request.meals).map(
      (target, index) =>
        `- id ${request.meals[index].id}: ${MEAL_NAMES[request.meals[index].slot]}, cerca de ${target.kcal} kcal (${macrosText(target)})`,
    ),
  ];
  return lines.join('\n');
}

type EatingWindow = DayRoutine['eatingWindows'][number];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const timeOf = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/** Uma refeição dura até 30 minutos... */
export const MEAL_MINUTES = 30;
/** ...e termina pelo menos 30 minutos antes do fim da janela (antes de uma hora em que não pode comer, do sono
 * ou do treino). */
export const MEAL_MARGIN_MINUTES = 30;

/**
 * Os horários em que dá para começar uma refeição em cada janela: do início até 1 hora antes do fim (o front
 * manda o fim no minuto 59 da hora, então conta até a hora cheia seguinte), em passos de 5 minutos e nunca antes
 * do início. Janelas 07:00–07:59 e 12:00–13:59 → 07:00–07:00 e 12:00–13:00.
 */
export function mealStartWindows(windows: EatingWindow[]): EatingWindow[] {
  return windows.map(({ start, end }) => {
    const last =
      Math.floor((minutes(end) + 1 - MEAL_MINUTES - MEAL_MARGIN_MINUTES) / 5) *
      5;
    return { start, end: timeOf(Math.max(minutes(start), last)) };
  });
}

/**
 * `count` horários espalhados pelas janelas, em ordem, arredondados para 5 minutos sem sair da janela. Usado
 * quando os horários do assistente não servem. Cada janela é um momento diferente em que dá para comer: com
 * janelas suficientes, uma refeição em cada (as escolhidas espalhadas pelo dia, a refeição no meio da janela);
 * com mais refeições que janelas, cada janela recebe uma e as que sobram vão para as mais longas, espalhadas por
 * igual dentro dela.
 */
export function spreadMealTimes(
  windows: EatingWindow[],
  count: number,
): string[] {
  const spans = windows.map(({ start, end }) => ({
    start: minutes(start),
    end: minutes(end),
  }));
  const perWindow = spans.map(() => 0);
  if (count <= spans.length) {
    for (let index = 0; index < count; index++) {
      const chosen =
        count === 1
          ? Math.floor((spans.length - 1) / 2)
          : Math.round((index * (spans.length - 1)) / (count - 1));
      perWindow[chosen] = 1;
    }
  } else {
    perWindow.fill(1);
    for (let extra = count - spans.length; extra > 0; extra--) {
      const share = (index: number) =>
        (spans[index].end - spans[index].start) / (perWindow[index] + 1);
      const longest = spans.reduce(
        (best, _, index) => (share(index) > share(best) ? index : best),
        0,
      );
      perWindow[longest]++;
    }
  }
  return spans.flatMap((span, index) =>
    Array.from({ length: perWindow[index] }, (_, k) => {
      const at =
        span.start + ((k + 0.5) / perWindow[index]) * (span.end - span.start);
      const rounded = Math.round(at / 5) * 5;
      return timeOf(Math.min(span.end, Math.max(span.start, rounded)));
    }),
  );
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
 * e os nutrientes do catálogo (`parseFoods`). Alimentos fora do catálogo, restritos ou fora do tipo de alimentação
 * são descartados; `null` se alguma refeição pedida não vier ou ficar sem alimentos.
 *
 * Horários: valem os de começar uma refeição em cada uma das `windows` (`mealStartWindows`). Se todos vêm
 * legíveis, dentro deles e na ordem de `ids` (a do dia), ficam os do assistente,
 * só adiantando os que passam de 6 horas depois da refeição anterior (`fitFastingLimit`). Senão (algum inválido,
 * repetido, fora das janelas ou fora de ordem), todos são espalhados pelas janelas (`spreadMealTimes`), com o
 * mesmo limite. `onTimesChanged` recebe os horários do assistente e os que ficaram, quando mudam.
 */
export function parsePersonalPlan(
  text: string,
  catalog: FoodCatalog,
  feedback: Record<string, FoodFeedback>,
  allowed: (name: string) => boolean,
  ids: number[],
  windows: EatingWindow[],
  onTimesChanged?: (from: string[], to: string[]) => void,
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

  const starts = mealStartWindows(windows);
  const given = ids.map((id) => times[id]);
  const usable =
    given.every(
      (time) =>
        TIME.test(time) &&
        starts.some(({ start, end }) => start <= time && time <= end),
    ) && given.every((time, index) => index === 0 || given[index - 1] < time);
  const final = fitFastingLimit(
    usable ? given : spreadMealTimes(starts, ids.length),
    starts,
  );
  if (final.some((time, index) => time !== given[index]))
    onTimesChanged?.(given, final);
  ids.forEach((id, index) => (result[id].time = final[index]));
  return result;
}
