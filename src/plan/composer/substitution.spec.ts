import { FoodCatalog } from '../engine/foods.js';
import { testFoods } from '../engine/test-catalog.js';
import { parseSubstitutes, substitutePrompt } from './substitution.js';

const catalog = new FoodCatalog(testFoods);
const parse = (names: unknown, feedback = {}) =>
  parseSubstitutes(JSON.stringify({ names }), catalog, feedback, 'Guacamole');

describe('parseSubstitutes', () => {
  it('aceita nomes exatos e sem acento/maiúsculas, na ordem do assistente', () => {
    expect(parse(['Abacate', 'azeite de OLIVA'])).toEqual([
      'Abacate',
      'Azeite de oliva',
    ]);
  });

  it('descarta inexistentes, o próprio, restritos e repetidos', () => {
    expect(
      parse(
        [
          'Não existe',
          'Guacamole',
          'Abacate',
          'Azeite de oliva',
          'abacate',
          42,
        ],
        { 'Azeite de oliva': 'nao-gosto' },
      ),
    ).toEqual(['Abacate']);
  });

  it('descarta crus quando o original não é cru', () => {
    const tacoCatalog = new FoodCatalog([
      ...testFoods,
      {
        name: 'Frango, peito, grelhado',
        group: 'proteinas',
        per100g: { carbs: 0, protein: 32, fat: 3, kcal: 159 },
      },
      {
        name: 'Merluza, filé, cru',
        group: 'proteinas',
        per100g: { carbs: 0, protein: 17, fat: 2, kcal: 89 },
      },
      {
        name: 'Merluza, filé, assado',
        group: 'proteinas',
        per100g: { carbs: 0, protein: 26, fat: 3, kcal: 122 },
      },
      {
        name: 'Banana, prata, crua',
        group: 'frutas',
        per100g: { carbs: 26, protein: 1, fat: 0, kcal: 98 },
      },
      {
        name: 'Maçã, crua',
        group: 'frutas',
        per100g: { carbs: 15, protein: 0, fat: 0, kcal: 56 },
      },
    ]);
    const text = (names: string[]) => JSON.stringify({ names });
    expect(
      parseSubstitutes(
        text(['Merluza, filé, cru', 'Merluza, filé, assado']),
        tacoCatalog,
        {},
        'Frango, peito, grelhado',
      ),
    ).toEqual(['Merluza, filé, assado']);
    expect(
      parseSubstitutes(
        text(['Maçã, crua']),
        tacoCatalog,
        {},
        'Banana, prata, crua',
      ),
    ).toEqual(['Maçã, crua']);
  });

  it('no máximo 8', () => {
    const names = testFoods
      .map((food) => food.name)
      .filter((name) => name !== 'Guacamole');
    expect(parse(names)).toEqual(names.slice(0, 8));
  });

  it('resposta inválida → nenhum', () => {
    expect(parseSubstitutes('não é JSON', catalog, {}, 'Guacamole')).toEqual(
      [],
    );
    expect(parse('Abacate')).toEqual([]);
  });
});

describe('substitutePrompt', () => {
  it('traz o alimento, a refeição, os outros alimentos e os restritos', () => {
    const prompt = substitutePrompt({
      food: { name: 'Guacamole', grams: 30 },
      mealTitle: 'Bowl de Frango',
      time: '12:30',
      mealFoods: ['Arroz integral'],
      restricted: ['Abacate'],
    });
    expect(prompt).toContain('"Guacamole" (30 g)');
    expect(prompt).toContain('"Bowl de Frango", às 12:30 (tarde)');
    expect(prompt).toContain('Outros alimentos da refeição: Arroz integral.');
    expect(prompt).toContain('Alimentos restritos (não sugira): Abacate.');
  });
});
