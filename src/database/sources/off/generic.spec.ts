import { FoodCatalog } from '../../../plan/engine/foods.js';
import type { CatalogFood } from '../../../plan/engine/types.js';
import {
  genericFood,
  needsOffFood,
  offSearchWords,
  type OffStats,
} from './generic.js';

const food = (
  name: string,
  kcal: number,
  group: CatalogFood['group'],
  animal: CatalogFood['animal'] = [],
): CatalogFood => ({
  name,
  group,
  per100g: { kcal, protein: 10, fat: 5, carbs: 3 },
  animal,
});

const catalog = new FoodCatalog([
  food('Queijo, ricota', 140, 'laticinios', ['leite']),
  food('Queijo, minas, frescal', 264, 'laticinios', ['leite']),
  food('Tangerina, Poncã, crua', 38, 'frutas'),
]);

const COTTAGE: OffStats = {
  count: 29,
  kcal: 94,
  protein: 12,
  fat: 4,
  carbs: 3.1,
  fiber: 0,
  sodiumMg: 295,
};
const APPROX = { kcal: 98, protein: 11, fat: 4, carbs: 3 };

describe('needsOffFood', () => {
  it('sem par no catálogo, ou com palavra desconhecida e calorias longe do par', () => {
    // "cottage" não existe no catálogo e a ricota tem 140 kcal: vale procurar no Open Food Facts.
    expect(needsOffFood(catalog, 'Queijo, cottage', APPROX)).toBe(true);
    expect(needsOffFood(catalog, 'Granola', { kcal: 400 })).toBe(true);
    // "ponkan" não existe, mas a tangerina do catálogo tem as calorias citadas.
    expect(needsOffFood(catalog, 'Tangerina, Ponkan, crua', { kcal: 38 })).toBe(
      false,
    );
    expect(needsOffFood(catalog, 'Queijo, ricota', { kcal: 140 })).toBe(false);
  });
});

describe('genericFood', () => {
  it('pela mediana, com o grupo e as origens animais da família', () => {
    expect(genericFood(catalog, ' queijo,  cottage ', APPROX, COTTAGE)).toEqual(
      {
        name: 'Queijo, cottage',
        group: 'laticinios',
        per100g: { kcal: 94, protein: 12, fat: 4, carbs: 3.1 },
        animal: ['leite'],
        microsPer100g: { fibras: 0, sodio: 295 },
        source: 'off',
        sourceId: 'queijo cottage',
      },
    );
  });

  it('sem família no catálogo, sem grupo', () => {
    expect(
      genericFood(catalog, 'Granola', { kcal: 400 }, { ...COTTAGE, kcal: 371 })
        ?.group,
    ).toBeNull();
  });

  it('nada com poucos produtos, calorias longe das citadas ou mais longe que o par do catálogo', () => {
    expect(
      genericFood(catalog, 'Queijo, cottage', APPROX, { ...COTTAGE, count: 2 }),
    ).toBeNull();
    expect(
      genericFood(catalog, 'Queijo, cottage', APPROX, {
        ...COTTAGE,
        kcal: 400,
      }),
    ).toBeNull();
    // A ricota (140) fica mais perto dos 150 citados que a mediana (94).
    expect(
      genericFood(catalog, 'Queijo, cottage', { kcal: 150 }, COTTAGE),
    ).toBeNull();
  });

  it('offSearchWords: palavras normalizadas de 3 letras ou mais', () => {
    expect(offSearchWords('Granola, sem açúcar, c/ mel')).toEqual([
      'granola',
      'sem',
      'acucar',
      'mel',
    ]);
  });
});
