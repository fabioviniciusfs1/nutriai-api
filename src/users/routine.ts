// Regras e textos da rotina (funções puras).
import { weekday } from '../common/timezone.js';
import type {
  Diet,
  MealSlot,
  Routine,
  RoutineSchedule,
  Weekday,
} from '../contract.js';

/** O front manda horas cheias: marcadas uma sim, uma não, as 24 horas dão 12 janelas. */
export const MAX_EATING_WINDOWS = 12;

/** No máximo um grupo por dia da semana. */
export const MAX_SCHEDULES = 7;

/** Os dias da semana na ordem da tela (de segunda a domingo). */
export const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const DAY_NAMES: Record<Weekday, string> = {
  0: 'domingo',
  1: 'segunda',
  2: 'terça',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sábado',
};

/** A rotina de um grupo de dias, com o tipo de alimentação (que vale para todos): o que monta um plano. */
export type DayRoutine = RoutineSchedule & { diet: Diet };

/** As refeições do dia, na ordem em que acontecem. */
export const MEAL_SLOTS: MealSlot[] = [
  'cafe-da-manha',
  'lanche-da-manha',
  'almoco',
  'lanche-da-tarde',
  'jantar',
  'ceia',
];

/** As refeições que todo plano tem, uma por período do dia; a pessoa escolhe só os lanches. */
export const MAIN_MEALS: MealSlot[] = ['cafe-da-manha', 'almoco', 'jantar'];

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
  const { schedules } = routine;
  if (schedules.length === 0 || schedules.length > MAX_SCHEDULES)
    return `Informe de 1 a ${MAX_SCHEDULES} grupos de dias.`;
  if (schedules.some((schedule) => schedule.days.length === 0))
    return 'Escolha os dias da semana de cada grupo.';
  const days = schedules.flatMap((schedule) => schedule.days);
  if (new Set(days).size !== days.length)
    return 'Um dia não pode estar em dois grupos.';
  if (WEEK.some((day) => !days.includes(day)))
    return 'Cada dia da semana deve estar em um grupo.';
  for (const schedule of schedules) {
    const error = scheduleError(schedule);
    if (error) return error;
  }
  return null;
}

/** Regras entre os campos de um grupo de dias. */
function scheduleError(routine: RoutineSchedule): string | null {
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
  return null;
}

/** Os dias por extenso: "segunda, quinta e sexta" ou "todos os dias". */
export function daysText(days: Weekday[]): string {
  if (days.length === WEEK.length) return 'todos os dias';
  const names = WEEK.filter((day) => days.includes(day)).map(
    (day) => DAY_NAMES[day],
  );
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`
    : names[0];
}

/** O grupo da rotina que tem o dia `day` ("AAAA-MM-DD"). */
export function scheduleOn(routine: Routine, day: string): RoutineSchedule {
  const today = weekday(day);
  return (
    routine.schedules.find((schedule) =>
      schedule.days.includes(today as Weekday),
    ) ?? routine.schedules[0]
  );
}

/** O que monta o plano do grupo `schedule`. */
export function dayRoutine(
  routine: Routine,
  schedule: RoutineSchedule,
): DayRoutine {
  return { ...schedule, diet: routine.diet };
}

/**
 * Os números dos grupos: um grupo que veio com o número de um grupo de `previous` fica com ele (e com o plano dele);
 * sem número conhecido, fica com o do grupo de `previous` que tem os mesmos dias; os outros ganham os próximos
 * números, sem repetir os de `previous`.
 */
export function withScheduleIds(
  routine: Routine,
  previous: Routine | null,
): Routine {
  const old = previous?.schedules ?? [];
  const known = new Set(old.map((schedule) => schedule.id));
  const sameDays = (a: Weekday[], b: Weekday[]) =>
    a.length === b.length && a.every((day) => b.includes(day));
  const used = new Set<number>();
  const kept = routine.schedules.map((schedule) => {
    const id = known.has(schedule.id)
      ? schedule.id
      : old.find(
          (item) =>
            !routine.schedules.some((other) => other.id === item.id) &&
            sameDays(item.days, schedule.days),
        )?.id;
    if (id === undefined || used.has(id)) return null;
    used.add(id);
    return id;
  });
  let next = Math.max(0, ...known) + 1;
  return {
    ...routine,
    schedules: routine.schedules.map((schedule, index) => ({
      ...schedule,
      id: kept[index] ?? next++,
    })),
  };
}

/** Um grupo da rotina como linhas de prompt para o assistente. */
export function routineLines(routine: RoutineSchedule): string[] {
  const windows = routine.eatingWindows
    .map(({ start, end }) => `${start}–${end}`)
    .join(', ');
  return [
    ...(routine.days.length < WEEK.length
      ? [`Dias da semana desta rotina: ${daysText(routine.days)}.`]
      : []),
    `Refeições que faz no dia: ${routine.meals.map((slot) => MEAL_NAMES[slot]).join(', ')}.`,
    `Rotina: acorda às ${routine.wakeTime} e dorme às ${routine.sleepTime}; ` +
      (routine.trainingStart && routine.trainingEnd
        ? `treina das ${routine.trainingStart} às ${routine.trainingEnd}.`
        : 'não treina.'),
    `Horários em que pode comer: ${windows}.`,
  ];
}
