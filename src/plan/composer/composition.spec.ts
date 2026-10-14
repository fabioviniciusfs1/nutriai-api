import { FoodCatalog } from '../engine/foods.js';
import { testFoods } from '../engine/test-catalog.js';
import { catalogPrompt, parseFoods, parseTitle } from './composition.js';

const catalog = new FoodCatalog(testFoods);

describe('parseFoods', () => {
  it('aceita nomes exatos e sem acento/pontuação, calcula os nutrientes pelo catálogo', () => {
    expect(
      parseFoods(
        [
          { name: 'Peito de frango grelhado', grams: 120 },
          { name: 'arroz integral', grams: 100.4 },
        ],
        catalog,
        {},
      ),
    ).toEqual([
      catalog.portion('Peito de frango grelhado', 120),
      catalog.portion('Arroz integral', 100),
    ]);
  });

  it('descarta alimentos fora do catálogo e restritos, soma repetidos e limita as gramas', () => {
    const foods = parseFoods(
      [
        { name: 'Pizza', grams: 200 },
        { name: 'Guacamole', grams: 30 },
        { name: 'Banana-prata', grams: 50 },
        { name: 'Banana-prata', grams: 30 },
        { name: 'Tapioca', grams: 5000 },
      ],
      catalog,
      { Guacamole: 'nao-gosto' },
    );
    expect(foods.map((food) => [food.name, food.grams])).toEqual([
      ['Banana-prata', 80],
      ['Tapioca', 1000],
    ]);
  });

  it('nada aproveitável vira lista vazia', () => {
    expect(parseFoods('não é lista', catalog, {})).toEqual([]);
    expect(parseFoods([{ name: 'Pizza', grams: 100 }], catalog, {})).toEqual(
      [],
    );
  });
});

describe('parseTitle', () => {
  it('título vazio usa o padrão', () => {
    expect(parseTitle('  Omelete  ', 'Refeição')).toBe('Omelete');
    expect(parseTitle('', 'Refeição')).toBe('Refeição');
    expect(parseTitle(undefined, 'Refeição')).toBe('Refeição');
  });
});

describe('prompts', () => {
  it('catálogo com uma linha por alimento', () => {
    expect(catalogPrompt(testFoods).split('\n')[0]).toBe(
      'Pão integral | carboidratos | 280 kcal, P 12, G 4, C 48',
    );
  });
});
