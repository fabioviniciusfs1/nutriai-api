import { FoodCatalog } from '../engine/foods.js';
import { testFoods } from '../engine/test-catalog.js';
import { parseApprox, parseFoods, parseTitle } from './composition.js';

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

  it('acha no catálogo o alimento citado com outro nome, desempatando pelas calorias', () => {
    const tables = new FoodCatalog([
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
      parseFoods(
        [
          {
            name: 'Arroz, branco',
            grams: 150,
            per100g: { kcal: 130, protein: 2.5, fat: 0.3, carbs: 28 },
          },
        ],
        tables,
        {},
      ),
    ).toEqual([tables.portion('Arroz, tipo 1, cozido', 150)]);
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

describe('parseApprox', () => {
  it('fica só com os números válidos', () => {
    expect(
      parseApprox({ kcal: 128, protein: 2.5, fat: -1, carbs: 'muito' }),
    ).toEqual({ kcal: 128, protein: 2.5 });
    expect(parseApprox(undefined)).toBeUndefined();
  });
});
