import type { Routine } from '../contract.js';
import { routineError, routineLines } from './routine.js';

const routine: Routine = {
  eatingWindows: [
    { start: '07:00', end: '08:30' },
    { start: '12:00', end: '13:30' },
  ],
  wakeTime: '06:30',
  sleepTime: '00:30',
  trainingStart: '18:00',
  trainingEnd: '19:00',
  meals: ['cafe-da-manha', 'almoco', 'jantar'],
  hungriestPeriod: 'tarde',
  leastHungryPeriod: 'manha',
  weighInDay: 1,
  diet: 'onivora',
};

describe('routineError', () => {
  const error = (change: Partial<Routine>) =>
    routineError({ ...routine, ...change });

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
      error({ eatingWindows: [...routine.eatingWindows].reverse() }),
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

  it('pelo menos uma refeição', () => {
    expect(error({ meals: [] })).toBe('Marque pelo menos uma refeição.');
    expect(error({ meals: ['ceia'] })).toBeNull();
  });

  it('treino com início e fim diferentes', () => {
    expect(error({ trainingEnd: '18:00' })).toBe(
      'O treino deve terminar depois de começar.',
    );
    // Rotina antiga, salva como "não treino".
    expect(error({ trainingStart: null, trainingEnd: null })).toBeNull();
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

  it('os períodos de mais e de menos fome são diferentes', () => {
    expect(error({ leastHungryPeriod: 'tarde' })).toContain('diferentes');
  });
});

describe('routineLines', () => {
  it('descreve a rotina para o assistente', () => {
    expect(routineLines(routine)).toEqual([
      'Refeições que faz no dia: café da manhã, almoço, jantar.',
      'Rotina: acorda às 06:30 e dorme às 00:30; treina das 18:00 às 19:00.',
      'Horários em que pode comer: 07:00–08:30, 12:00–13:30.',
      'Sente mais fome de tarde e menos fome de manhã.',
    ]);
  });
});
