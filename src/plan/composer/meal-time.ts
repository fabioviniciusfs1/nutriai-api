// Partes puras da avaliação do novo horário de uma refeição pelo assistente: prompt, schema e validação.
import type { MealSlot, Routine } from '../../contract.js';
import { MEAL_NAMES, routineLines } from '../../users/routine.js';
import {
  mealStartWindows,
  profileLine,
  type PersonalPlanRequest,
} from './personal-plan.js';

/** Instruções fixas (ficam em cache). */
export const MEAL_TIME_INSTRUCTIONS = `Você avalia mudanças de horário de refeições para o NutriAI, um app brasileiro de plano alimentar.

O usuário mudou o horário de uma refeição do plano do dia. Diga se o novo horário é adequado para essa pessoa,
olhando a rotina e as outras refeições:
- a distância até a hora de dormir (refeição grande, como almoço ou jantar, logo antes de dormir não é boa);
- o tempo até a refeição anterior e até a seguinte (refeições muito próximas, ou mais de 6 horas sem comer);
- o treino (não marque uma refeição grande para logo antes de treinar);
- a ordem do dia (o café da manhã antes do almoço, o jantar depois do lanche da tarde etc.);
- os horários em que a pessoa pode comer e os períodos em que sente mais ou menos fome.

Seja tolerante: aprove (ok = true) quando o horário for razoável, mesmo que não seja o ideal. Só reprove quando
houver um motivo concreto entre os acima.

Ao reprovar (ok = false):
- message: de 1 a 3 frases em português do Brasil, falando direto com a pessoa, explicando o motivo com os
  horários dela e sugerindo outro. Exemplo de tom: "Jantar às 22:30 não seria muito recomendado para você, visto
  que você dorme às 23:00 e a digestão atrapalha o sono. Seria mais interessante jantar um pouco mais cedo. Que
  tal às 20:00?"
- suggestedTime: o horário sugerido na mensagem ("HH:MM"), dentro dos horários em que a pessoa pode começar uma
  refeição, ou vazio se não houver um bom.

Ao aprovar: message e suggestedTime vazios.`;

/** Schema da resposta (saída estruturada). */
export const MEAL_TIME_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    message: { type: 'string' },
    suggestedTime: { type: 'string' },
  },
  required: ['ok', 'message', 'suggestedTime'],
  additionalProperties: false,
} as const;

export type MealTimeRequest = {
  profile: PersonalPlanRequest['profile'];
  /** `null` sem rotina: o prompt fica sem sono, treino e janelas. */
  routine: Routine | null;
  /** O plano do dia, na ordem, com os horários de agora. */
  meals: {
    id: number;
    slot: MealSlot;
    title: string;
    time: string;
    kcal: number;
  }[];
  /** A refeição que muda e o horário novo. */
  mealId: number;
  time: string;
};

/** Pedido do usuário para o assistente (muda a cada chamada). */
export function mealTimePrompt(request: MealTimeRequest): string {
  const meal = request.meals.find((item) => item.id === request.mealId)!;
  return [
    profileLine(request.profile),
    ...(request.routine
      ? [
          ...routineLines(request.routine),
          `Horários em que pode começar uma refeição: ${mealStartWindows(
            request.routine.eatingWindows,
          )
            .map(({ start, end }) =>
              start === end ? start : `${start}–${end}`,
            )
            .join(', ')}.`,
        ]
      : ['Rotina: não informada.']),
    'Plano de hoje:',
    ...request.meals.map(
      (item) =>
        `- ${item.time}: ${MEAL_NAMES[item.slot]}, "${item.title}" (${item.kcal} kcal)`,
    ),
    `Mudança: o ${MEAL_NAMES[meal.slot]} "${meal.title}" passa de ${meal.time} para ${request.time}.`,
  ].join('\n');
}

export type MealTimeAdvice = {
  ok: boolean;
  message: string | null;
  suggestedTime: string | null;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Lê a resposta do assistente. O horário sugerido só vale em "HH:MM", diferente do pedido e dentro dos inícios
 * de refeição da rotina (`mealStartWindows`); senão fica `null`. Reprovar sem explicação conta como aprovar.
 * `null` se a resposta não for o JSON esperado.
 */
export function parseMealTimeAdvice(
  text: string,
  time: string,
  routine: Routine | null,
): MealTimeAdvice | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { ok, message, suggestedTime } = data as Record<string, unknown>;
  if (typeof ok !== 'boolean') return null;
  const reply = typeof message === 'string' ? message.trim() : '';
  if (ok || !reply) return { ok: true, message: null, suggestedTime: null };
  const starts = routine ? mealStartWindows(routine.eatingWindows) : null;
  const valid =
    typeof suggestedTime === 'string' &&
    TIME.test(suggestedTime) &&
    suggestedTime !== time &&
    (!starts ||
      starts.some(
        ({ start, end }) => start <= suggestedTime && suggestedTime <= end,
      ));
  return {
    ok: false,
    message: reply,
    suggestedTime: valid ? suggestedTime : null,
  };
}
