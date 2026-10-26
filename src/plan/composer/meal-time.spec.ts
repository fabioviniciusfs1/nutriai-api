import type { Routine } from '../../contract.js';
import {
  mealTimePrompt,
  outsideWindowsAdvice,
  parseMealTimeAdvice,
  type MealTimeRequest,
} from './meal-time.js';

const routine: Routine = {
  eatingWindows: [
    { start: '07:00', end: '08:59' },
    { start: '12:00', end: '13:59' },
    { start: '18:00', end: '22:59' },
  ],
  wakeTime: '06:30',
  sleepTime: '23:00',
  trainingStart: null,
  trainingEnd: null,
  meals: ['cafe-da-manha', 'almoco', 'jantar'],
  hungriestPeriod: null,
  leastHungryPeriod: null,
  weighInDay: 1,
  diet: 'onivora',
};

const request: MealTimeRequest = {
  profile: {
    sex: 'feminino',
    age: 32,
    weightKg: 68.5,
    heightCm: 165,
    activityLevel: 'moderado',
    goal: 'perder',
  },
  routine,
  meals: [
    {
      id: 1,
      slot: 'cafe-da-manha',
      title: 'Ovos com Pão',
      time: '07:30',
      kcal: 400,
    },
    {
      id: 2,
      slot: 'almoco',
      title: 'Frango com Arroz',
      time: '12:30',
      kcal: 600,
    },
    {
      id: 3,
      slot: 'jantar',
      title: 'Peixe com Legumes',
      time: '19:30',
      kcal: 500,
    },
  ],
  mealId: 3,
  time: '22:00',
};

const reply = (body: object) => JSON.stringify(body);

describe('mealTimePrompt', () => {
  it('traz o perfil, a rotina, o plano do dia e a mudança', () => {
    const prompt = mealTimePrompt(request);
    expect(prompt).toContain('Usuário: sexo feminino, 32 anos');
    expect(prompt).toContain('dorme às 23:00');
    expect(prompt).toContain(
      'Horários em que pode começar uma refeição: 07:00–08:00, 12:00–13:00, 18:00–22:00.',
    );
    expect(prompt).toContain('- 12:30: almoço, "Frango com Arroz" (600 kcal)');
    expect(prompt).toContain(
      'Mudança: o jantar "Peixe com Legumes" passa de 19:30 para 22:00.',
    );
  });

  it('sem rotina, diz que não foi informada', () => {
    expect(mealTimePrompt({ ...request, routine: null })).toContain(
      'Rotina: não informada.',
    );
  });
});

describe('parseMealTimeAdvice', () => {
  const parse = (body: object | string) =>
    parseMealTimeAdvice(
      typeof body === 'string' ? body : reply(body),
      '22:00',
      routine,
    );

  it('aprovado: sem mensagem nem sugestão', () => {
    expect(parse({ ok: true, message: '', suggestedTime: '' })).toEqual({
      ok: true,
      message: null,
      suggestedTime: null,
      canKeep: true,
    });
  });

  it('reprovado com sugestão dentro dos inícios de refeição', () => {
    expect(
      parse({
        ok: false,
        message: 'Jantar às 22:00 fica perto do sono. Que tal às 20:00?',
        suggestedTime: '20:00',
      }),
    ).toEqual({
      ok: false,
      message: 'Jantar às 22:00 fica perto do sono. Que tal às 20:00?',
      suggestedTime: '20:00',
      canKeep: true,
    });
  });

  it('descarta sugestão fora das janelas, igual ao pedido ou mal formatada', () => {
    for (const suggestedTime of ['22:30', '22:00', '8h', '']) {
      expect(
        parse({ ok: false, message: 'Muito tarde.', suggestedTime })
          ?.suggestedTime,
      ).toBeNull();
    }
  });

  it('reprovar sem explicação conta como aprovar', () => {
    expect(
      parse({ ok: false, message: '  ', suggestedTime: '20:00' })?.ok,
    ).toBe(true);
  });

  it('resposta que não é o JSON esperado: null', () => {
    expect(parse('não é json')).toBeNull();
    expect(parse({ message: 'sem ok' })).toBeNull();
  });
});

describe('outsideWindowsAdvice', () => {
  const advice = (time: string) => outsideWindowsAdvice({ routine, time });

  it('dentro dos inícios de refeição (ou sem rotina): sem aviso', () => {
    expect(advice('07:30')).toBeNull();
    expect(advice('22:00')).toBeNull();
    expect(outsideWindowsAdvice({ routine: null, time: '03:00' })).toBeNull();
  });

  it('fora deles: sem manter, com o início permitido mais perto', () => {
    expect(advice('06:00')).toEqual({
      ok: false,
      message:
        'Pela sua rotina, você não pode comer às 06:00: os horários para começar uma refeição são ' +
        '07:00–08:00, 12:00–13:00 e 18:00–22:00. Que tal às 07:00?',
      suggestedTime: '07:00',
      canKeep: false,
    });
    expect(advice('10:30')?.suggestedTime).toBe('12:00');
    expect(advice('09:00')?.suggestedTime).toBe('08:00');
    expect(advice('22:30')?.suggestedTime).toBe('22:00');
  });
});
