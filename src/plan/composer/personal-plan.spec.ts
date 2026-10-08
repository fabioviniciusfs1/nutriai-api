import { allowedByDiet } from '../engine/diet.js';
import { FoodCatalog } from '../engine/foods.js';
import { testCatalog, testFoods } from '../engine/test-catalog.js';
import { personalPlanRequest } from '../personalizer.service.js';
import {
  mealRole,
  parsePersonalPlan,
  personalPlanPrompt,
} from './personal-plan.js';

const catalog = new FoodCatalog(testFoods);
const vegetarian = (name: string) =>
  allowedByDiet(catalog.entry(name) ?? {}, 'vegetariana');
const parse = (meals: unknown, ids = [1, 2]) =>
  parsePersonalPlan(
    JSON.stringify({ meals }),
    catalog,
    { Abacate: 'nao-gosto' },
    vegetarian,
    ids,
  );

describe('parsePersonalPlan', () => {
  it('monta as refeições pedidas com os nutrientes do catálogo', () => {
    expect(
      parse([
        { id: 1, title: 'Tofu com Pão', foods: [{ name: 'tofu', grams: 100 }] },
        { id: 2, title: '', foods: [{ name: 'Ovos', grams: 100 }] },
        {
          id: 9,
          title: 'Fora do pedido',
          foods: [{ name: 'Ovos', grams: 50 }],
        },
      ]),
    ).toEqual({
      1: { title: 'Tofu com Pão', foods: [catalog.portion('Tofu', 100)] },
      2: { title: 'Refeição', foods: [catalog.portion('Ovos', 100)] },
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
      parsePersonalPlan('não é JSON', catalog, {}, () => true, [1]),
    ).toBeNull();
    expect(parse('nada')).toBeNull();
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
    mealsPerDay: 4,
    weighInDay: 1,
    diet: 'vegetariana',
    preferences: 'Almoço de marmita; treino às 18h.',
  } as const;

  it('pede as refeições do plano base pelas refeições por dia, com as metas divididas', () => {
    const request = personalPlanRequest(profile, testCatalog, ['Abacate']);
    expect(request.meals.map((meal) => meal.id)).toEqual([1, 2, 4, 3]);
    expect(request.day.kcal).toBe(1660);
    const total = request.meals.reduce((sum, meal) => sum + meal.kcal, 0);
    expect(Math.abs(total - 1660)).toBeLessThanOrEqual(4);

    const prompt = personalPlanPrompt(request);
    expect(prompt).toContain('sexo feminino, 32 anos, 68.5 kg, 165 cm');
    expect(prompt).toContain('objetivo perder peso');
    expect(prompt).toContain('Meta do dia: 1660 kcal');
    expect(prompt).toContain('Tipo de alimentação: vegetariana');
    expect(prompt).toContain('Almoço de marmita; treino às 18h.');
    expect(prompt).toContain('não use): Abacate');
    expect(prompt).toContain('- id 1: café da manhã, às 07:30 (manhã)');
    expect(prompt).toContain('- id 4: lanche da tarde, às 16:00 (tarde)');
  });

  it('papel da refeição pelo horário', () => {
    expect(
      ['07:30', '10:00', '12:30', '16:00', '20:00', '22:00'].map(mealRole),
    ).toEqual([
      'café da manhã',
      'lanche da manhã',
      'almoço',
      'lanche da tarde',
      'jantar',
      'ceia',
    ]);
  });
});
