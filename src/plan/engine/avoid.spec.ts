import type { AvoidRule } from '../../contract.js';
import {
  avoidMatcher,
  avoidOptionFor,
  avoidOptions,
  avoidText,
  foodKind,
} from './avoid.js';

// Nomes como estão na TACO e na TBCA.
const NAMES = [
  'Batata, inglesa, cozida',
  'Batata, inglesa, frita',
  'Batata, doce, cozida',
  'Batata, doce, s/ casca, assada, s/ óleo, s/ sal',
  'Batata baroa (mandioquinha, batata salsa), cozida, drenada, s/ óleo, c/ sal, Chaerophyllum bulbosum',
  'Batata, baroa, crua',
  'Purê, batata inglesa, abóbora (jerimum), c/ manteiga',
  'Carne, boi, músculo, s/ gordura, cozida, c/ batata doce e cenoura',
  'Cenoura, crua',
  'Cenoura, cozida',
  'Cenoura, s/ casca, refogada (c/ óleo, cebola e alho), c/ sal, Daucus carota L.',
  'Bolo, cenoura, c/ cobertura de chocolate',
  'Arroz com cenoura, c/ óleo, cebola e alho, c/ sal',
  'Porco, lombo, assado',
  'Carne, porco, bisteca, crua, Sus ssp.',
  'Papa de peito de frango e batata baroa (mandioquinha, batata salsa), c/ sal',
  'Peixe, água doce, Tilápia, filé s/ pele, cozido',
];

const rule = (
  kind: string,
  scope: AvoidRule['scope'] = 'alimento',
): AvoidRule => ({ kind, label: kind, scope });

describe('foodKind', () => {
  it('é o começo do nome sem o preparo', () => {
    expect(foodKind('Batata, doce, s/ casca, assada, s/ óleo, s/ sal')).toBe(
      foodKind('Batata, doce, cozida'),
    );
    expect(foodKind('Cenoura, crua')).toBe(foodKind('Cenoura, cozida'));
    expect(foodKind('Batata, inglesa, cozida')).not.toBe(
      foodKind('Batata, doce, cozida'),
    );
  });

  it('junta os jeitos de escrever das duas tabelas', () => {
    expect(
      foodKind(
        'Batata baroa (mandioquinha, batata salsa), cozida, drenada, s/ óleo, c/ sal',
      ),
    ).toBe(foodKind('Batata, baroa, crua'));
    expect(foodKind('Carne, porco, bisteca, crua, Sus ssp.')).toBe(
      foodKind('Porco, bisteca, crua'),
    );
    expect(foodKind('Carne, boi, acém, cru')).toBe(
      foodKind('Carne, bovina, acém, cru'),
    );
  });
});

describe('avoidMatcher', () => {
  const cenoura = foodKind('Cenoura, crua');

  it('sem regras, não tira nada', () => {
    expect(NAMES.filter(avoidMatcher([]))).toEqual([]);
  });

  it('só o alimento: a cenoura em qualquer preparo, não os pratos', () => {
    expect(NAMES.filter(avoidMatcher([rule(cenoura)]))).toEqual([
      'Cenoura, crua',
      'Cenoura, cozida',
      'Cenoura, s/ casca, refogada (c/ óleo, cebola e alho), c/ sal, Daucus carota L.',
    ]);
  });

  it('também o que leva: os pratos com cenoura no nome', () => {
    const avoided = avoidMatcher([rule(cenoura, 'ingrediente')]);
    expect(avoided('Bolo, cenoura, c/ cobertura de chocolate')).toBe(true);
    expect(avoided('Arroz com cenoura, c/ óleo, cebola e alho, c/ sal')).toBe(
      true,
    );
    expect(
      avoided(
        'Carne, boi, músculo, s/ gordura, cozida, c/ batata doce e cenoura',
      ),
    ).toBe(true);
    expect(avoided('Batata, doce, cozida')).toBe(false);
  });

  it('batata inglesa não tira a batata-doce nem a mandioquinha', () => {
    const avoided = avoidMatcher([rule(foodKind('Batata, inglesa, cozida'))]);
    expect(NAMES.filter(avoided)).toEqual([
      'Batata, inglesa, cozida',
      'Batata, inglesa, frita',
    ]);
  });

  it('a família toda tira todos os tipos', () => {
    const avoided = avoidMatcher([
      rule(foodKind('Batata, doce, cozida').split(' ')[0]),
    ]);
    expect(avoided('Batata, doce, cozida')).toBe(true);
    expect(avoided('Batata, inglesa, cozida')).toBe(true);
    expect(avoided('Batata, baroa, crua')).toBe(true);
    expect(
      avoided('Purê, batata inglesa, abóbora (jerimum), c/ manteiga'),
    ).toBe(false);
  });

  it('pega nomes fora do catálogo (o que o Claude cita, produtos)', () => {
    const avoided = avoidMatcher([rule(cenoura, 'ingrediente')]);
    expect(avoided('Bolo de cenoura Bauducco')).toBe(true);
    expect(avoided('Cenoura ralada')).toBe(true);
  });
});

describe('avoidOptions', () => {
  it('separa os tipos de batata, com a família toda antes', () => {
    const options = avoidOptions(NAMES, 'batata');
    const [family, ...kinds] = options.map((option) => option.label);
    expect(family).toBe('Batata (todos os tipos)');
    expect(kinds.sort()).toEqual([
      'Batata baroa',
      'Batata doce',
      'Batata inglesa',
    ]);
    const doce = options.find((option) => option.label === 'Batata doce')!;
    expect(doce.foods.count).toBe(2);
    // Também o que leva: o prato de carne com batata doce.
    expect(doce.ingredient.count).toBe(3);
    expect(doce.ingredient.examples).toEqual([
      'Carne, boi, músculo, s/ gordura, cozida, c/ batata doce e cenoura',
    ]);
  });

  it('acha o tipo por outro nome dele, sem a família toda', () => {
    expect(avoidOptions(NAMES, 'mandioquinha').map((o) => o.label)).toEqual([
      'Batata baroa',
    ]);
  });

  it('o prato com o alimento no nome não vira um tipo', () => {
    const options = avoidOptions(NAMES, 'cenoura');
    expect(options.map((option) => option.label)).toEqual(['Cenoura']);
    expect(options[0].foods.count).toBe(3);
    expect(options[0].ingredient.count).toBe(6);
  });

  it('a carne de porco das duas tabelas fica num tipo só', () => {
    const [porco] = avoidOptions(NAMES, 'porco');
    expect(porco.foods.count).toBe(2);
  });

  it('sem texto, nada', () => {
    expect(avoidOptions(NAMES, '  ')).toEqual([]);
  });
});

describe('avoidText', () => {
  it('diz ao Claude o tipo e o alcance', () => {
    expect(
      avoidText([
        { kind: 'cenouro', label: 'Cenoura', scope: 'ingrediente' },
        { kind: 'batato doce', label: 'Batata doce', scope: 'alimento' },
      ]),
    ).toBe('cenoura (nem pratos ou produtos que levam cenoura); batata doce');
  });
});

describe('avoidOptionFor', () => {
  it('é o tipo do alimento, com os outros preparos dele', () => {
    const option = avoidOptionFor(NAMES, 'Batata, doce, cozida')!;
    expect(option.label).toBe('Batata doce');
    expect(option.foods.count).toBe(2);
  });

  it('sem outros preparos no catálogo, não há o que oferecer', () => {
    expect(
      avoidOptionFor(NAMES, 'Peixe, água doce, Tilápia, filé s/ pele, cozido'),
    ).toBeNull();
  });
});
