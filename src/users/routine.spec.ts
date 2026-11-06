import type { Routine, RoutineSchedule } from '../contract.js';
import {
  daysText,
  routineError,
  routineLines,
  scheduleOn,
  WEEK,
  withScheduleIds,
} from './routine.js';

const schedule: RoutineSchedule = {
  id: 1,
  days: WEEK,
  eatingWindows: [
    { start: '07:00', end: '08:30' },
    { start: '12:00', end: '13:30' },
  ],
  wakeTime: '06:30',
  sleepTime: '00:30',
  trainingStart: '18:00',
  trainingEnd: '19:00',
  meals: ['cafe-da-manha', 'almoco', 'jantar'],
};

const routine: Routine = {
  schedules: [schedule],
  weighInDay: 1,
  diet: 'onivora',
};

/** Dois grupos: seg, qui e sex; ter, qua, sáb e dom. */
const split = (first = [1, 4, 5], second = [2, 3, 6, 0]): Routine => ({
  ...routine,
  schedules: [
    { ...schedule, id: 1, days: first as RoutineSchedule['days'] },
    { ...schedule, id: 2, days: second as RoutineSchedule['days'] },
  ],
});

describe('routineError', () => {
  const error = (change: Partial<RoutineSchedule>) =>
    routineError({ ...routine, schedules: [{ ...schedule, ...change }] });

  it('aceita a rotina válida (inclusive dormir depois da meia-noite)', () => {
    expect(routineError(routine)).toBeNull();
  });

  it('janelas: pelo menos uma, até 12, início antes do fim, em ordem e sem sobreposição', () => {
    expect(error({ eatingWindows: [] })).toContain('pelo menos um');
    expect(
      error({
        eatingWindows: Array.from({ length: 13 }, (_, index) => ({
          start: `${String(index + 10)}:00`,
          end: `${String(index + 10)}:30`,
        })),
      }),
    ).toContain('até 12');
    expect(
      error({ eatingWindows: [{ start: '08:00', end: '08:00' }] }),
    ).toContain('início deve ser antes do fim');
    expect(
      error({ eatingWindows: [...schedule.eatingWindows].reverse() }),
    ).toContain('em ordem');
    // Uma janela pode começar quando a outra termina.
    expect(
      error({
        eatingWindows: [
          { start: '07:00', end: '08:00' },
          { start: '08:00', end: '09:00' },
        ],
      }),
    ).toBeNull();
  });

  it('treino com início e fim diferentes', () => {
    expect(error({ trainingEnd: '18:00' })).toBe(
      'O treino deve terminar depois de começar.',
    );
    // Não treina: os dois em branco; só um é erro.
    expect(error({ trainingStart: null, trainingEnd: null })).toBeNull();
    expect(error({ trainingEnd: null })).toBe(
      'Informe o início e o fim do treino.',
    );
    expect(error({ trainingStart: null })).toBe(
      'Informe o início e o fim do treino.',
    );
  });

  it('as janelas ficam fora do sono e do treino', () => {
    const busy =
      'Os horários para comer não podem cair no horário de sono ou de treino.';
    const windows = (...items: [string, string][]) => ({
      eatingWindows: items.map(([start, end]) => ({ start, end })),
    });
    // Sono das 00:30 às 06:30 e treino das 18:00 às 19:00.
    expect(error(windows(['06:00', '07:00']))).toBe(busy);
    expect(error(windows(['00:00', '01:00']))).toBe(busy);
    expect(error(windows(['18:30', '19:30']))).toBe(busy);
    expect(error(windows(['17:00', '20:00']))).toBe(busy);
    // Encostar no sono ou no treino pode: come logo depois de treinar.
    expect(
      error(
        windows(['06:30', '07:00'], ['17:00', '18:00'], ['19:00', '20:00']),
      ),
    ).toBeNull();
    // Sono e treino que passam da meia-noite.
    const night = { sleepTime: '22:00', wakeTime: '05:00' };
    expect(error({ ...night, ...windows(['23:00', '23:59']) })).toBe(busy);
    expect(error({ ...night, ...windows(['04:00', '05:00']) })).toBe(busy);
    expect(error({ ...night, ...windows(['21:00', '22:00']) })).toBeNull();
    const lateTraining = { trainingStart: '23:30', trainingEnd: '00:20' };
    expect(error({ ...lateTraining, ...windows(['23:00', '23:59']) })).toBe(
      busy,
    );
    expect(
      error({ ...lateTraining, ...windows(['22:00', '23:00']) }),
    ).toBeNull();
  });

  it('grupos de dias: cada dia da semana em exatamente um, de 1 a 7 grupos', () => {
    expect(routineError(split())).toBeNull();
    expect(routineError(split([1, 4], [2, 3, 6, 0]))).toBe(
      'Cada dia da semana deve estar em um grupo.',
    );
    expect(routineError(split([1, 4, 5, 2], [2, 3, 6, 0]))).toBe(
      'Um dia não pode estar em dois grupos.',
    );
    expect(routineError(split([], WEEK))).toBe(
      'Escolha os dias da semana de cada grupo.',
    );
    expect(routineError({ ...routine, schedules: [] })).toContain('de 1 a 7');
  });

  it('as regras dos horários valem em cada grupo', () => {
    const routines = split();
    routines.schedules[1] = { ...routines.schedules[1], eatingWindows: [] };
    expect(routineError(routines)).toContain('pelo menos um');
  });
});

describe('grupos de dias', () => {
  it('o grupo de hoje é o que tem o dia da semana', () => {
    // 2026-11-02 é uma segunda; 2026-11-03, uma terça.
    expect(scheduleOn(split(), '2026-11-02').id).toBe(1);
    expect(scheduleOn(split(), '2026-11-03').id).toBe(2);
  });

  it('os grupos que já existiam ficam com o número; os novos ganham os próximos', () => {
    const next = withScheduleIds(
      {
        ...routine,
        schedules: [
          { ...schedule, id: 2, days: [1] },
          { ...schedule, id: 0, days: [2] },
          { ...schedule, id: 9, days: [3] },
        ],
      },
      split(),
    );
    expect(next.schedules.map((item) => item.id)).toEqual([2, 3, 4]);
    expect(
      withScheduleIds(routine, null).schedules.map((item) => item.id),
    ).toEqual([1]);
    // Sem número, o grupo com os mesmos dias continua o mesmo.
    const resent = withScheduleIds(
      {
        ...routine,
        schedules: split().schedules.map((item) => ({ ...item, id: 0 })),
      },
      split(),
    );
    expect(resent.schedules.map((item) => item.id)).toEqual([1, 2]);
  });

  it('os dias por extenso', () => {
    expect(daysText(WEEK)).toBe('todos os dias');
    expect(daysText([5, 1, 4])).toBe('segunda, quinta e sexta');
    expect(daysText([0])).toBe('domingo');
  });
});

describe('routineLines', () => {
  it('descreve a rotina de um grupo para o assistente', () => {
    expect(routineLines({ ...schedule, days: [6, 0] })[0]).toBe(
      'Dias da semana desta rotina: sábado e domingo.',
    );
    expect(routineLines(schedule)).toEqual([
      'Refeições que faz no dia: café da manhã, almoço, jantar.',
      'Rotina: acorda às 06:30 e dorme às 00:30; treina das 18:00 às 19:00.',
      'Horários em que pode comer: 07:00–08:30, 12:00–13:30.',
    ]);
  });
});
