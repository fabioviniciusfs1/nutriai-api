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

  it('grão ou massa crua nunca, mesmo no lugar de outro cru', () => {
    const grains = new FoodCatalog([
      ...testFoods,
      {
        name: 'Macarrão, trigo, cru',
        group: 'carboidratos',
        per100g: { carbs: 77, protein: 10, fat: 1, kcal: 371 },
      },
      {
        name: 'Arroz, tipo 1, cru',
        group: 'carboidratos',
        per100g: { carbs: 79, protein: 7, fat: 0, kcal: 358 },
      },
      {
        name: 'Arroz, tipo 1, cozido',
        group: 'carboidratos',
        per100g: { carbs: 28, protein: 3, fat: 0, kcal: 128 },
      },
    ]);
    expect(
      parseSubstitutes(
        JSON.stringify({
          names: ['Arroz, tipo 1, cru', 'Arroz, tipo 1, cozido'],
        }),
        grains,
        {},
        'Macarrão, trigo, cru',
      ),
    ).toEqual(['Arroz, tipo 1, cozido']);
  });

  it('lê o formato com os valores por 100 g', () => {
    expect(
      parseSubstitutes(
        JSON.stringify({
          foods: [
            { name: 'abacate', per100g: { kcal: 96 } },
            { name: 'Pizza de calabresa', per100g: { kcal: 280 } },
          ],
        }),
        catalog,
        {},
        'Guacamole',
      ),
    ).toEqual(['Abacate']);
  });

  it('descarta o próprio alimento em outro preparo', () => {
    const roots = new FoodCatalog([
      {
        name: 'Batata, doce, cozida',
        group: 'vegetais',
        per100g: { carbs: 18, protein: 1, fat: 0, kcal: 77 },
      },
      {
        name: 'Batata, doce, assada',
        group: 'vegetais',
        per100g: { carbs: 21, protein: 1, fat: 0, kcal: 90 },
      },
      {
        name: 'Mandioca, cozida',
        group: 'vegetais',
        per100g: { carbs: 30, protein: 1, fat: 0, kcal: 125 },
      },
    ]);
    expect(
      parseSubstitutes(
        JSON.stringify({ names: ['Batata, doce, assada', 'Mandioca, cozida'] }),
        roots,
        {},
        'Batata, doce, cozida',
      ),
    ).toEqual(['Mandioca, cozida']);
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

describe('parseSubstitutes: variedade', () => {
  const oils = new FoodCatalog(
    [
      'Óleo, soja',
      'Óleo, de canola',
      'Óleo, de girassol',
      'Azeitona, preta, conserva',
    ].map((name) => ({
      name,
      group: 'gorduras' as const,
      per100g: { kcal: 884, protein: 0, fat: 100, carbs: 0 },
    })),
  );
  const text = JSON.stringify({
    names: [
      'Óleo, soja',
      'Óleo, de canola',
      'Óleo, de girassol',
      'Azeitona, preta, conserva',
    ],
  });

  it('no máximo 2 da mesma família, contando os já oferecidos', () => {
    expect(parseSubstitutes(text, oils, {}, 'Azeite')).toEqual([
      'Óleo, soja',
      'Óleo, de canola',
      'Azeitona, preta, conserva',
    ]);
    expect(
      parseSubstitutes(text, oils, {}, 'Azeite', () => true, [
        'Óleo, de milho',
      ]),
    ).toEqual(['Óleo, soja', 'Azeitona, preta, conserva']);
  });
});

describe('substitutePrompt', () => {
  it('traz o alimento, a refeição, os outros alimentos e os restritos', () => {
    const prompt = substitutePrompt({
      food: {
        name: 'Guacamole',
        grams: 30,
        kcal: 48,
        protein: 1,
        fat: 4.3,
        carbs: 2.6,
      },
      slot: 'almoco',
      mealTitle: 'Bowl de Frango',
      time: '12:30',
      mealFoods: ['Arroz integral'],
      restricted: ['Abacate'],
      avoid: [{ kind: 'batato doce', label: 'Batata doce', scope: 'alimento' }],
      diet: 'onivora',
      exclude: [],
    });
    expect(prompt).toContain(
      '"Guacamole" (30 g: 48 kcal; 1 g de proteína, 4 g de gordura, 3 g de carboidrato; 73% das calorias vêm da gordura).',
    );
    expect(prompt).toContain(
      'Refeição: almoço, "Bowl de Frango", às 12:30 (tarde)',
    );
    expect(prompt).toContain('Outros alimentos da refeição: Arroz integral.');
    expect(prompt).toContain('Alimentos restritos (não sugira): Abacate.');
    expect(prompt).toContain(
      'Alimentos que a pessoa não come (nunca use, em nenhum preparo): batata doce.',
    );
    expect(prompt).not.toContain('Já oferecidos');
  });

  it('no "Ver mais", lista os já oferecidos para não repetir', () => {
    const prompt = substitutePrompt({
      food: {
        name: 'Guacamole',
        grams: 30,
        kcal: 48,
        protein: 1,
        fat: 4.3,
        carbs: 2.6,
      },
      slot: 'almoco',
      mealTitle: 'Bowl de Frango',
      time: '12:30',
      mealFoods: [],
      restricted: [],
      diet: 'onivora',
      exclude: ['Abacate', 'Azeite de oliva'],
    });
    expect(prompt).toContain(
      'Já oferecidos ao usuário (não repita): Abacate; Azeite de oliva.',
    );
  });
});
