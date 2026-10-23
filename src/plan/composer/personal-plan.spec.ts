import type { Routine } from '../../contract.js';
import { allowedByDiet } from '../engine/diet.js';
import { FoodCatalog } from '../engine/foods.js';
import { testCatalog, testFoods } from '../engine/test-catalog.js';
import { personalPlanRequest } from '../personalizer.service.js';
import {
  fitFastingLimit,
  nextMealDeadline,
  parsePersonalPlan,
  personalPlanPrompt,
  spreadMealTimes,
} from './personal-plan.js';

const WINDOWS = [
  { start: '07:00', end: '08:00' },
  { start: '12:00', end: '13:00' },
  { start: '19:00', end: '20:00' },
];

const catalog = new FoodCatalog(testFoods);
const vegetarian = (name: string) =>
  allowedByDiet(catalog.entry(name) ?? {}, 'vegetariana');
const parse = (meals: unknown, ids = [1, 2], windows = WINDOWS) =>
  parsePersonalPlan(
    JSON.stringify({ meals }),
    catalog,
    { Abacate: 'nao-gosto' },
    vegetarian,
    ids,
    windows,
  );

describe('parsePersonalPlan', () => {
  it('monta as refeições pedidas com os nutrientes do catálogo', () => {
    expect(
      parse([
        {
          id: 1,
          title: 'Tofu com Pão',
          time: '07:30',
          foods: [{ name: 'tofu', grams: 100 }],
        },
        {
          id: 2,
          title: '',
          time: '12:30',
          foods: [{ name: 'Ovos', grams: 100 }],
        },
        {
          id: 9,
          title: 'Fora do pedido',
          foods: [{ name: 'Ovos', grams: 50 }],
        },
      ]),
    ).toEqual({
      1: {
        title: 'Tofu com Pão',
        time: '07:30',
        foods: [catalog.portion('Tofu', 100)],
      },
      2: {
        title: 'Refeição',
        time: '12:30',
        foods: [catalog.portion('Ovos', 100)],
      },
    });
  });

  it('descarta restritos e fora da dieta; refeição vazia faz falhar', () => {
    const meals = parse([
      {
        id: 1,
        title: 'Café',
        foods: [
          { name: 'Abacate', grams: 50 },
          { name: 'Peito de frango grelhado', grams: 100 },
          { name: 'Ovos', grams: 100 },
        ],
      },
      {
        id: 2,
        title: 'Almoço',
        foods: [{ name: 'Tilápia assada', grams: 150 }],
      },
    ]);
    expect(meals).toBeNull();
    expect(
      parse(
        [
          {
            id: 1,
            title: 'Café',
            foods: [
              { name: 'Abacate', grams: 50 },
              { name: 'Peito de frango grelhado', grams: 100 },
              { name: 'Ovos', grams: 100 },
            ],
          },
        ],
        [1],
      )?.[1].foods.map((food) => food.name),
    ).toEqual(['Ovos']);
  });

  it('resposta inválida → null', () => {
    expect(
      parsePersonalPlan('não é JSON', catalog, {}, () => true, [1], WINDOWS),
    ).toBeNull();
    expect(parse('nada')).toBeNull();
  });
});

describe('horários das refeições', () => {
  const meal = (id: number, time?: unknown) => ({
    id,
    title: 'Refeição',
    time,
    foods: [{ name: 'Ovos', grams: 100 }],
  });
  const times = (meals: unknown, ids: number[], windows = WINDOWS) =>
    Object.fromEntries(
      Object.entries(parse(meals, ids, windows) ?? {}).map(([id, item]) => [
        id,
        item.time,
      ]),
    );

  it('fica com os horários do assistente quando estão dentro das janelas', () => {
    expect(times([meal(1, '08:00'), meal(2, '13:00')], [1, 2])).toEqual({
      1: '08:00',
      2: '13:00',
    });
  });

  it('fora das janelas, repetido, ilegível ou fora de ordem: espalha pelas janelas na ordem pedida', () => {
    // 12:30 + 6 h = 18:30, fora das janelas: o jantar vem no início da próxima (19:00).
    const spread = { 1: '07:30', 2: '12:30', 3: '19:00' };
    expect(
      times([meal(1, '12:30'), meal(2, '07:30'), meal(3, '23:00')], [1, 2, 3]),
    ).toEqual(spread);
    expect(
      times([meal(1, '12:30'), meal(2, '07:30'), meal(3, '23:00')], [2, 3, 1]),
    ).toEqual({ 2: '07:30', 3: '12:30', 1: '19:00' });
    expect(
      times([meal(2, '07:30'), meal(1, '07:30'), meal(3)], [1, 2, 3]),
    ).toEqual(spread);
    // Café da manhã depois do almoço: fora da ordem do dia.
    expect(times([meal(1, '12:30'), meal(2, '07:30')], [1, 2])).toEqual({
      1: '07:30',
      2: '19:00',
    });
  });

  it('janelas de tamanhos diferentes: uma refeição em cada, e só adianta o que passou de 6 horas', () => {
    // Marcou 07, 12 e das 18 às 21; mais fome à noite, o assistente pôs o jantar às 19:30.
    const hours = [
      { start: '07:00', end: '07:59' },
      { start: '12:00', end: '12:59' },
      { start: '18:00', end: '21:59' },
    ];
    expect(
      times(
        [meal(1, '07:30'), meal(2, '12:30'), meal(3, '19:30')],
        [1, 2, 3],
        hours,
      ),
    ).toEqual({ 1: '07:30', 2: '12:30', 3: '18:30' });
    // Sem horários que sirvam: o café não vai para o meio-dia.
    expect(times([meal(1), meal(2), meal(3)], [1, 2, 3], hours)).toEqual({
      1: '07:30',
      2: '12:30',
      3: '18:30',
    });
  });

  describe('no máximo 6 horas entre uma refeição e a seguinte', () => {
    const DAY = [{ start: '07:00', end: '22:00' }];
    const SPLIT = [
      { start: '12:00', end: '13:00' },
      { start: '19:00', end: '20:00' },
    ];

    it('prazo: 6 horas depois, ou o início da próxima janela se nesse horário não pode comer', () => {
      expect(nextMealDeadline('08:00', DAY)).toBe(14 * 60);
      expect(nextMealDeadline('12:00', SPLIT)).toBe(19 * 60);
      expect(nextMealDeadline('20:00', SPLIT)).toBeNull();
    });

    it('aceita os horários do assistente que respeitam o prazo', () => {
      expect(
        times([meal(1, '12:00'), meal(2, '19:00')], [1, 2], SPLIT),
      ).toEqual({ 1: '12:00', 2: '19:00' });
      expect(times([meal(1, '08:00'), meal(2, '14:00')], [1, 2], DAY)).toEqual({
        1: '08:00',
        2: '14:00',
      });
    });

    it('passou do prazo: fica com os horários do assistente e adianta só o que passou', () => {
      expect(
        times([meal(1, '12:00'), meal(2, '19:30')], [1, 2], SPLIT),
      ).toEqual({ 1: '12:00', 2: '19:00' });
      expect(times([meal(1, '07:00'), meal(2, '14:00')], [1, 2], DAY)).toEqual({
        1: '07:00',
        2: '13:00',
      });
    });

    it('avisa quando os horários mudam', () => {
      const changed = vi.fn();
      parsePersonalPlan(
        JSON.stringify({
          meals: [meal(1, '07:00'), meal(2, '14:00')],
        }),
        catalog,
        {},
        vegetarian,
        [1, 2],
        DAY,
        changed,
      );
      expect(changed).toHaveBeenCalledWith(
        ['07:00', '14:00'],
        ['07:00', '13:00'],
      );
    });

    it('fitFastingLimit só adianta, na ordem', () => {
      expect(fitFastingLimit(['07:00', '14:00', '21:00'], DAY)).toEqual([
        '07:00',
        '13:00',
        '19:00',
      ]);
    });
  });

  it('spreadMealTimes: uma refeição por janela; as que sobram, nas mais longas; passos de 5 minutos', () => {
    expect(spreadMealTimes(WINDOWS, 3)).toEqual(['07:30', '12:30', '19:30']);
    expect(spreadMealTimes(WINDOWS, 6)).toEqual([
      '07:15',
      '07:45',
      '12:15',
      '12:45',
      '19:15',
      '19:45',
    ]);
    expect(spreadMealTimes([{ start: '12:00', end: '12:07' }], 2)).toEqual([
      '12:00',
      '12:05',
    ]);
    const uneven = [
      { start: '07:00', end: '07:59' },
      { start: '12:00', end: '12:59' },
      { start: '18:00', end: '21:59' },
    ];
    expect(spreadMealTimes(uneven, 3)).toEqual(['07:30', '12:30', '20:00']);
    // Menos refeições que janelas: as escolhidas ficam espalhadas pelo dia.
    expect(spreadMealTimes(uneven, 2)).toEqual(['07:30', '20:00']);
    expect(spreadMealTimes(uneven, 5)).toEqual([
      '07:30',
      '12:30',
      '18:40',
      '20:00',
      '21:20',
    ]);
  });
});

describe('personalPlanPrompt e personalPlanRequest', () => {
  const profile = {
    sex: 'feminino',
    age: 32,
    weightKg: 68.5,
    heightCm: 165,
    activityLevel: 'moderado',
    goal: 'perder',
    targetWeightKg: null,
  } as const;
  const routine: Routine = {
    eatingWindows: WINDOWS,
    wakeTime: '06:30',
    sleepTime: '23:00',
    trainingStart: '18:00',
    trainingEnd: '19:00',
    meals: ['cafe-da-manha', 'almoco', 'lanche-da-tarde', 'jantar'],
    hungriestPeriod: 'noite',
    leastHungryPeriod: 'manha',
    weighInDay: 1,
    diet: 'vegetariana',
  };

  it('pede as refeições do plano base que o usuário faz, na ordem do dia, com a rotina', () => {
    const request = personalPlanRequest(profile, routine, testCatalog, [
      'Abacate',
    ]);
    expect(request.meals.map((meal) => meal.id)).toEqual([1, 2, 4, 3]);
    expect(request.day.kcal).toBe(1660);

    const prompt = personalPlanPrompt(request);
    expect(prompt).toContain('sexo feminino, 32 anos, 68.5 kg, 165 cm');
    expect(prompt).toContain('objetivo perder peso');
    expect(prompt).toContain('Meta do dia: 1660 kcal');
    expect(prompt).toContain('Tipo de alimentação: vegetariana');
    expect(prompt).toContain('não use): Abacate');
    expect(prompt).toContain(
      'Rotina: acorda às 06:30 e dorme às 23:00; treina das 18:00 às 19:00.',
    );
    expect(prompt).toContain(
      'Horários em que pode comer: 07:00–08:00, 12:00–13:00, 19:00–20:00.',
    );
    expect(prompt).toContain('Sente mais fome de noite e menos fome de manhã.');
    expect(prompt).toContain(
      [
        'Refeições a montar:',
        '- id 1: café da manhã',
        '- id 2: almoço',
        '- id 4: lanche da tarde',
        '- id 3: jantar',
      ].join('\n'),
    );
    expect(
      personalPlanRequest(
        profile,
        { ...routine, meals: ['ceia', 'almoco'] },
        testCatalog,
        [],
      ).meals,
    ).toEqual([
      { id: 2, slot: 'almoco' },
      { id: 6, slot: 'ceia' },
    ]);
    expect(
      personalPlanPrompt({
        ...request,
        routine: { ...routine, trainingStart: null, trainingEnd: null },
      }),
    ).toContain('não treina.');
  });
});
