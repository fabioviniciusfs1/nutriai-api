import { offDisplayName, offRow } from './parse.js';

const LINE = {
  code: '7891000100103',
  name: 'Leite Condensado Integral',
  brand: 'Moça',
  quantity: '395 g',
  servingG: 20,
  countries: ['en:brazil'],
  kcal: 325,
  protein: 7,
  carbs: 55,
  fat: 8,
  fiber: 0,
  sodiumMg: null,
};

describe('offRow', () => {
  it('lê a linha do arquivo filtrado, com o nome normalizado para a busca', () => {
    expect(offRow(LINE)).toEqual({
      ...LINE,
      searchName: 'leite condensado integral moca',
    });
  });

  it('descarta linha sem código válido, sem nome ou sem macro', () => {
    expect(offRow({ ...LINE, code: '123' })).toBeNull();
    expect(offRow({ ...LINE, code: '78910001001AB' })).toBeNull();
    expect(offRow({ ...LINE, name: '  ' })).toBeNull();
    expect(offRow({ ...LINE, fat: null })).toBeNull();
    expect(offRow({ ...LINE, kcal: -1 })).toBeNull();
    expect(offRow(null)).toBeNull();
  });

  it('tira o caractere nulo e o UTF-16 quebrado, que o Postgres não aceita', () => {
    const row = offRow({
      ...LINE,
      name: 'Leite\u0000 Moça\ud800',
      brand: '\u0000',
    });
    expect(row?.name).toBe('Leite Moça\ufffd');
    expect(row?.brand).toBeNull();
  });

  it('porção zerada ou ausente vira null', () => {
    expect(offRow({ ...LINE, servingG: 0 })?.servingG).toBeNull();
    expect(offRow({ ...LINE, servingG: undefined })?.servingG).toBeNull();
  });
});

describe('offDisplayName', () => {
  it('põe a marca entre parênteses quando ela não está no nome', () => {
    expect(offDisplayName('Leite Condensado', 'Moça')).toBe(
      'Leite Condensado (Moça)',
    );
    expect(offDisplayName('Leite Moça', 'Moça')).toBe('Leite Moça');
    expect(offDisplayName('Leite Moca', 'Moça')).toBe('Leite Moca');
    expect(offDisplayName('Tradicional', null)).toBe('Tradicional');
  });
});
