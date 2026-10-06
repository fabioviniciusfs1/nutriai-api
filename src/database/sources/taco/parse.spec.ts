import type { OdsSheet } from '../ods.js';
import {
  parseTaco,
  parseTacoValue,
  TACO_PAGE1_COLUMNS,
  TACO_PAGE2_COLUMNS,
} from './parse.js';

const header1 = ['id', 'nome', ...TACO_PAGE1_COLUMNS];
const header2 = ['id', 'nome', ...TACO_PAGE2_COLUMNS];

/** Linha da pag1 com os valores das primeiras colunas (o resto fica de fora, como no .ods). */
const row1 = (id: number, nome: string, ...values: string[]) => [
  String(id),
  nome,
  ...values,
];

function sheets(page1: string[][], page2: string[][]): OdsSheet[] {
  return [
    { name: 'pag1', rows: [header1, ...page1] },
    { name: 'pag2', rows: [header2, ...page2] },
  ];
}

describe('parseTacoValue', () => {
  it('trata os marcadores e a vírgula decimal', () => {
    expect(parseTacoValue('*')).toBeNull();
    expect(parseTacoValue('NA')).toBeNull();
    expect(parseTacoValue('')).toBeNull();
    expect(parseTacoValue(undefined)).toBeNull();
    expect(parseTacoValue('Tr')).toBe(0);
    expect(parseTacoValue('2,6')).toBe(2.6);
    expect(parseTacoValue('124')).toBe(124);
    expect(parseTacoValue(',0,02')).toBe(0.02);
    expect(parseTacoValue('abc')).toBeUndefined();
  });
});

describe('parseTaco', () => {
  it('junta as páginas pelo id e completa com nulo', () => {
    const { foods, warnings } = parseTaco(
      sheets(
        [
          row1(
            1,
            'Arroz, integral, cozido',
            '124',
            '517',
            '2,6',
            '1,0',
            'NA',
            '25,8',
            '2,7',
            '0,5',
            '5',
          ),
          row1(2, 'Arroz, integral, cru', '360', '1505', '*', 'Tr'),
        ],
        [['1', 'Arroz, integral, cozido', '0,3', 'Tr', '0,3']],
      ),
    );
    expect(warnings).toEqual([]);
    expect(foods[0]).toMatchObject({
      id: 1,
      nome: 'Arroz, integral, cozido',
      categoria: 'Cereais e derivados',
      energia_kcal: 124,
      proteina_g: 2.6,
      colesterol_mg: null,
      calcio_mg: 5,
      // Colunas ausentes no fim da linha = vazio.
      vitamina_c_mg: null,
      saturados_g: 0.3,
      monoinsaturados_g: 0,
    });
    // Sem linha na pag2: gorduras nulas.
    expect(foods[1]).toMatchObject({
      proteina_g: null,
      lipideos_g: 0,
      saturados_g: null,
    });
  });

  it('corrige o nome do id 540 e avisa sobre nomes diferentes e valores corrigidos', () => {
    const lambari = row1(298, 'Lambari,  fresco, cru', '152');
    lambari[2 + TACO_PAGE1_COLUMNS.indexOf('piridoxina_mg')] = ',0,02';
    const { foods, warnings } = parseTaco(
      sheets(
        [row1(540, 'L', '117'), lambari],
        [
          ['540', 'Feijoada', '2,7'],
          ['298', 'Lambari, fresco,cru', '1'],
        ],
      ),
    );
    expect(foods.map((food) => [food.id, food.nome])).toEqual([
      [298, 'Lambari, fresco, cru'],
      [540, 'Feijoada'],
    ]);
    expect(foods[0].piridoxina_mg).toBe(0.02);
    expect(warnings).toEqual([
      'pag1, id 298, piridoxina_mg: valor ",0,02" lido como 0.02.',
      'id 298: nome diferente nas páginas ("Lambari, fresco, cru" x "Lambari, fresco,cru"); usado o da pag1.',
      'id 540: nome "L" corrigido para "Feijoada".',
    ]);
  });

  it('recusa cabeçalho diferente', () => {
    const bad: OdsSheet[] = [
      { name: 'pag1', rows: [['id', 'nome', 'kcal']] },
      { name: 'pag2', rows: [header2] },
    ];
    expect(() => parseTaco(bad)).toThrow(/Cabeçalho inesperado/);
  });
});
