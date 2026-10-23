import { FoodCatalog, isSameFood } from './foods.js';
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

describe('isSameFood', () => {
  it('o mesmo alimento em outro preparo', () => {
    expect(
      isSameFood(
        'Batata, doce, cozida',
        'Batata, doce, s/ casca, assada, s/ óleo, c/ sal',
      ),
    ).toBe(true);
    expect(
      isSameFood(
        'Ovo, de galinha, inteiro, cozido/10minutos',
        'Ovo, galinha, inteiro, cozido, c/ sal',
      ),
    ).toBe(true);
    expect(
      isSameFood(
        'Carne, bovina, patinho, grelhado',
        'Carne, boi, patinho, assado',
      ),
    ).toBe(true);
  });

  it('outro alimento da mesma família não é o mesmo', () => {
    expect(isSameFood('Batata, doce, cozida', 'Batata, inglesa, cozida')).toBe(
      false,
    );
    expect(isSameFood('Arroz, tipo 1, cozido', 'Arroz, tipo 2, cozido')).toBe(
      false,
    );
    expect(
      isSameFood('Pão, trigo, francês', 'Pão, trigo, forma, integral'),
    ).toBe(false);
  });
});

describe('FoodCatalog.substituteOptions', () => {
  const root = (name: string, kcal: number, carbs: number) => ({
    name,
    group: 'vegetais' as const,
    per100g: { kcal, protein: 1, fat: 0, carbs },
  });
  const roots = new FoodCatalog([
    root('Batata, doce, cozida', 77, 18),
    root('Batata, doce, assada, s/ sal', 90, 21),
    root('Batata, doce, assada, c/ sal', 90, 21),
    root('Batata, doce, frita', 150, 25),
    root('Batata, baroa, cozida', 80, 19),
    root('Batata, inglesa, cozida', 52, 12),
    root('Batata, inglesa, assada', 85, 19),
    root('Batata, yacon, crua', 40, 9),
    root('Mandioca, cozida, s/ sal', 125, 30),
    root('Mandioca, cozida, c/ sal', 125, 30),
    root('Cará, cozido', 78, 19),
    root('Farinha, de mandioca', 361, 89),
  ]);

  it('sem o mesmo alimento em outro preparo, no máximo 2 da família, sem versões repetidas', () => {
    expect(
      roots
        .substituteOptions('Batata, doce, cozida', 100, {}, 5)
        .map((food) => food.name),
    ).toEqual([
      'Batata, baroa, cozida',
      // Uma batata-inglesa só (assada e cozida são o mesmo alimento).
      'Batata, inglesa, assada',
      'Cará, cozido',
      'Mandioca, cozida, s/ sal',
      'Farinha, de mandioca',
    ]);
  });

  it('as calorias por 100 g contam: farinha depois de raiz cozida', () => {
    const names = roots
      .substituteOptions('Batata, doce, cozida', 100, {}, 8)
      .map((food) => food.name);
    expect(names.indexOf('Farinha, de mandioca')).toBeGreaterThan(
      names.indexOf('Mandioca, cozida, s/ sal'),
    );
    // Faltando opção, vêm mais da família (mas nunca a própria batata-doce).
    expect(names).toContain('Batata, yacon, crua');
    expect(names.some((name) => name.startsWith('Batata, doce'))).toBe(false);
  });
});
