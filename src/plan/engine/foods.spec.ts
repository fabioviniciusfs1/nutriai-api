import { FoodCatalog } from './foods.js';
import type { CatalogFood } from './types.js';

const food = (
  name: string,
  kcal: number,
  group: CatalogFood['group'] = 'carboidratos',
  source = 'taco',
): CatalogFood => ({
  name,
  group,
  per100g: { kcal, protein: 0, fat: 0, carbs: 0 },
  source,
});

const catalog = new FoodCatalog([
  food('Arroz, tipo 1, cru', 358),
  food('Arroz, tipo 1, cozido', 128),
  food('Arroz, integral, cozido', 124),
  food(
    'Arroz à grega, c/ arroz polido, c/ sal, (arroz polido, c/ cenoura, vagem, pimentão verde, uva passa, c/ óleo, cebola e alho, c/ sal)',
    150,
    'carboidratos',
    'tbca',
  ),
  food('Frango, peito, sem pele, cru', 119, 'proteinas'),
  food('Frango, peito, sem pele, grelhado', 159, 'proteinas'),
  food(
    'Peixe, água doce, Tilápia, filé s/ pele, cozido, s/ óleo, c/ sal, Oreochromis niloticus',
    128,
    'proteinas',
    'tbca',
  ),
  food(
    'Peixe, água salgada, pescada, assado/grelhado, s/ óleo, c/ sal',
    130,
    'proteinas',
    'tbca',
  ),
  // Preparos comuns, como no catálogo de verdade ("assado" é bem mais comum que "tilápia").
  food('Frango, coxa, com pele, assada', 215, 'proteinas'),
  food('Carne, bovina, fraldinha, assada', 260, 'proteinas'),
  food('Batata, inglesa, assada', 90),
  food('Banana, prata, crua', 98, 'frutas'),
  food('Bolo, banana, caseiro', 300, null, 'tbca'),
  food('Castanha-do-Brasil, crua', 643, 'gorduras'),
  food('Mandioca, cozida', 125),
  food('Café, infusão 10%', 9, null),
  food('Soja, queijo (tofu)', 64, 'proteinas'),
]);

describe('FoodCatalog.match', () => {
  it('nome igual, sem diferenciar acentos, maiúsculas e pontuação', () => {
    expect(catalog.match('Arroz, tipo 1, cozido')).toBe(
      'Arroz, tipo 1, cozido',
    );
    expect(catalog.match('arroz tipo 1 cozido')).toBe('Arroz, tipo 1, cozido');
  });

  it('acha pelo sentido: sinônimos, plural/feminino e o nome mais simples', () => {
    expect(catalog.match('Arroz branco cozido')).toBe('Arroz, tipo 1, cozido');
    expect(catalog.match('Peito de frango grelhado')).toBe(
      'Frango, peito, sem pele, grelhado',
    );
    expect(catalog.match('Aipim cozido')).toBe('Mandioca, cozida');
    expect(catalog.match('Castanha-do-pará')).toBe('Castanha-do-Brasil, crua');
    expect(catalog.match('Tofu, cru', { kcal: 76 })).toBe(
      'Soja, queijo (tofu)',
    );
  });

  it('não troca o cozido pelo cru: pelo nome e pelas calorias', () => {
    expect(catalog.match('Frango, peito')).toBe(
      'Frango, peito, sem pele, grelhado',
    );
    expect(catalog.match('Arroz, tipo 1', { kcal: 130 })).toBe(
      'Arroz, tipo 1, cozido',
    );
    expect(catalog.match('Arroz, tipo 1', { kcal: 350 })).toBe(
      'Arroz, tipo 1, cru',
    );
  });

  it('a palavra rara decide ("tilápia" pesa mais que "peixe")', () => {
    expect(catalog.match('Tilápia, grelhada')).toMatch(/Tilápia/);
    expect(catalog.match('Peixe, tilápia, assada')).toMatch(/Tilápia/);
  });

  it('frutas e castanhas cruas valem sem "cru" no nome', () => {
    expect(catalog.match('Banana prata')).toBe('Banana, prata, crua');
  });

  it('a família do alimento tem de estar no nome citado', () => {
    expect(catalog.match('Banana')).toBe('Banana, prata, crua');
    expect(catalog.match('Bolo de banana')).toBe('Bolo, banana, caseiro');
  });

  it('calorias pequenas não descartam (café, folhas)', () => {
    expect(catalog.match('Café, infusão', { kcal: 2 })).toBe(
      'Café, infusão 10%',
    );
  });

  it('sem correspondência → null', () => {
    expect(catalog.match('Whey protein')).toBeNull();
    expect(catalog.match('Pizza de calabresa')).toBeNull();
    expect(catalog.match('Mandioca, cozida', { kcal: 900 })).toBe(
      'Mandioca, cozida',
    );
    expect(catalog.match('Mandioca frita', { kcal: 900 })).toBeNull();
  });
});

describe('FoodCatalog.search', () => {
  it('primeiro os que começam pelo texto, depois a TACO e os nomes curtos', () => {
    expect(
      catalog.search('arroz', {}).candidates.map((food) => food.name),
    ).toEqual([
      'Arroz, tipo 1, cru',
      'Arroz, tipo 1, cozido',
      'Arroz, integral, cozido',
      'Arroz à grega, c/ arroz polido, c/ sal, (arroz polido, c/ cenoura, vagem, pimentão verde, uva passa, c/ óleo, cebola e alho, c/ sal)',
    ]);
    expect(
      catalog.search('banana', {}).candidates.map((food) => food.name),
    ).toEqual(['Banana, prata, crua', 'Bolo, banana, caseiro']);
  });
});
