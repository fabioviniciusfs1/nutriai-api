// Regras e textos da rotina (funções puras).
import type { MealSlot, Routine } from '../contract.js';
import { PERIOD_NAMES } from '../plan/composer/composition.js';

/** O front manda horas cheias: marcadas uma sim, uma não, as 24 horas dão 12 janelas. */
export const MAX_EATING_WINDOWS = 12;

/** As refeições do dia, na ordem em que acontecem. */
export const MEAL_SLOTS: MealSlot[] = [
  'cafe-da-manha',
  'lanche-da-manha',
  'almoco',
  'lanche-da-tarde',
  'jantar',
  'ceia',
];

export const MEAL_NAMES: Record<MealSlot, string> = {
  'cafe-da-manha': 'café da manhã',
  'lanche-da-manha': 'lanche da manhã',
  almoco: 'almoço',
  'lanche-da-tarde': 'lanche da tarde',
  jantar: 'jantar',
  ceia: 'ceia',
};

const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/**
 * Se a janela (no mesmo dia, início antes do fim) tem algum minuto dentro do intervalo de `from` até `to`, que
 * pode passar da meia-noite (`to` antes de `from`); `from` igual a `to` é intervalo vazio.
 */
function overlaps(
  window: { start: string; end: string },
  from: string,
  to: string,
): boolean {
  const [start, end, a, b] = [window.start, window.end, from, to].map(minutes);
  const within = (x: number, y: number) => start < y && end > x;
  return a < b ? within(a, b) : a > b && (within(a, 1440) || within(0, b));
}

/** Regras entre os campos da rotina: a mensagem do primeiro problema, ou `null` se está tudo certo. */
export function routineError(routine: Routine): string | null {
  if (routine.meals.length === 0) return 'Marque pelo menos uma refeição.';
  const windows = routine.eatingWindows;
  if (windows.length === 0)
    return 'Informe pelo menos um horário disponível para comer.';
  if (windows.length > MAX_EATING_WINDOWS)
    return `Informe até ${MAX_EATING_WINDOWS} horários disponíveis para comer.`;
  for (const [index, window] of windows.entries()) {
    if (window.start >= window.end)
      return 'Em cada horário disponível, o início deve ser antes do fim.';
    if (index > 0 && window.start < windows[index - 1].end)
      return 'Os horários disponíveis para comer devem estar em ordem e não podem se sobrepor.';
  }
  const { trainingStart, trainingEnd } = routine;
  // Os dois horários juntos, ou nenhum (não treina).
  if ((trainingStart === null) !== (trainingEnd === null))
    return 'Informe o início e o fim do treino.';
  if (trainingStart !== null && trainingStart === trainingEnd)
    return 'O treino deve terminar depois de começar.';
  const busy = (window: { start: string; end: string }) =>
    overlaps(window, routine.sleepTime, routine.wakeTime) ||
    (trainingStart !== null &&
      trainingEnd !== null &&
      overlaps(window, trainingStart, trainingEnd));
  if (windows.some(busy))
    return 'Os horários para comer não podem cair no horário de sono ou de treino.';
  if (
    routine.hungriestPeriod !== null &&
    routine.hungriestPeriod === routine.leastHungryPeriod
  )
    return 'O período de mais fome e o de menos fome devem ser diferentes.';
  return null;
}

/** O que a pessoa disse sobre a fome ao longo do dia (cada período é opcional). */
function hungerLine({ hungriestPeriod, leastHungryPeriod }: Routine): string {
  const parts = [
    hungriestPeriod && `mais fome de ${PERIOD_NAMES[hungriestPeriod]}`,
    leastHungryPeriod && `menos fome de ${PERIOD_NAMES[leastHungryPeriod]}`,
  ].filter(Boolean);
  return parts.length > 0
    ? `Sente ${parts.join(' e ')}.`
    : 'Não tem um período do dia com mais ou menos fome.';
}

/** A rotina como linhas de prompt para o assistente. */
export function routineLines(routine: Routine): string[] {
  const windows = routine.eatingWindows
    .map(({ start, end }) => `${start}–${end}`)
    .join(', ');
  return [
    `Refeições que faz no dia: ${routine.meals.map((slot) => MEAL_NAMES[slot]).join(', ')}.`,
    `Rotina: acorda às ${routine.wakeTime} e dorme às ${routine.sleepTime}; ` +
      (routine.trainingStart && routine.trainingEnd
        ? `treina das ${routine.trainingStart} às ${routine.trainingEnd}.`
        : 'não treina.'),
    `Horários em que pode comer: ${windows}.`,
    hungerLine(routine),
  ];
}
