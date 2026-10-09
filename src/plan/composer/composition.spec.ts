import { FoodCatalog } from '../engine/foods.js';
import { testFoods } from '../engine/test-catalog.js';
import {
  catalogPrompt,
  compositionPrompt,
  parseComposition,
} from './composition.js';

const catalog = new FoodCatalog(testFoods);

describe('parseComposition', () => {
  it('aceita nomes exatos e sem acento/pontuação, calcula os nutrientes pelo catálogo', () => {
    const suggestion = parseComposition(
      JSON.stringify({
        title: 'Frango com Arroz',
        foods: [
          { name: 'Peito de frango grelhado', grams: 120 },
          { name: 'arroz integral', grams: 100.4 },
        ],
      }),
      catalog,
      {},
      '12:30',
    );
    expect(suggestion).toEqual({
      title: 'Frango com Arroz',
      periods: ['tarde'],
      foods: [
        catalog.portion('Peito de frango grelhado', 120),
        catalog.portion('Arroz integral', 100),
      ],
    });
  });

  it('descarta alimentos fora do catálogo e restritos, soma repetidos e limita as gramas', () => {
    const suggestion = parseComposition(
      JSON.stringify({
        title: '',
        foods: [
          { name: 'Pizza', grams: 200 },
          { name: 'Guacamole', grams: 30 },
          { name: 'Banana-prata', grams: 50 },
          { name: 'Banana-prata', grams: 30 },
          { name: 'Tapioca', grams: 5000 },
        ],
      }),
      catalog,
      { Guacamole: 'nao-gosto' },
      '20:00',
    );
    expect(suggestion?.title).toBe('Refeição sugerida');
    expect(suggestion?.foods.map((food) => [food.name, food.grams])).toEqual([
      ['Banana-prata', 80],
      ['Tapioca', 1000],
    ]);
  });

  it('nada aproveitável vira null', () => {
    expect(parseComposition('não é json', catalog, {}, '08:00')).toBeNull();
    expect(
      parseComposition(
        JSON.stringify({ title: 'x', foods: [{ name: 'Pizza', grams: 100 }] }),
        catalog,
        {},
        '08:00',
      ),
    ).toBeNull();
    expect(
      parseComposition(JSON.stringify({ title: 'x' }), catalog, {}, '08:00'),
    ).toBeNull();
  });
});

describe('prompts', () => {
  it('catálogo com uma linha por alimento', () => {
    expect(catalogPrompt(testFoods).split('\n')[0]).toBe(
      'Pão integral | carboidratos | 280 kcal, P 12, G 4, C 48',
    );
  });

  it('pedido com metas, restrições e o resto do dia', () => {
    const prompt = compositionPrompt({
      title: 'Pré-treino',
      time: '16:00',
      kcal: 400,
      macros: { protein: 30, fat: 10, carbs: 50 },
      restricted: ['Guacamole'],
      otherMeals: [{ title: 'Almoço', foods: ['Arroz integral'] }],
      diet: 'vegetariana',
    });
    expect(prompt).toContain('Tipo de alimentação: vegetariana');
    expect(prompt).toContain('"Pré-treino", às 16:00 (tarde)');
    expect(prompt).toContain('cerca de 400 kcal');
    expect(prompt).toContain(
      '30 g de proteína, 10 g de gordura, 50 g de carboidrato',
    );
    expect(prompt).toContain('não use): Guacamole');
    expect(prompt).toContain('- Almoço: Arroz integral');
  });
});
