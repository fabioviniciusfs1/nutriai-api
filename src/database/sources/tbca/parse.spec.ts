import {
  cleanTbcaName,
  parseCsv,
  parseTbca,
  parseTbcaValue,
  TBCA_COLUMNS,
} from './parse.js';

const HEADER = [
  'ID',
  'ALIMENTO',
  'Energia KJ',
  'Energia Kcal',
  'Umidade g',
  'Carboidrato total',
  'Carboidrato dispon�vel',
  'Prote�na',
  'Lip�dios',
  'Fibra alimentar',
  '�lcool',
  'Cinzas',
  'Colesterol',
  '�cidos graxos saturados',
  '�cidos graxos monoinsaturados',
  '�cidos graxos polinsaturados',
  '�cidos graxos trans',
  'C�lcio',
  'Ferro',
  'S�dio',
  'Magn�sio',
  'F�sforo',
  'Pot�ssio',
  'Zinco',
  'Cobre',
  'Sel�nio',
  'Vitamina A (RE)',
  'Vitamina A (RAE)',
  'Vitamina D',
  'Alfa-tocoferol (Vitamina E)',
  'Tiamina',
  'Riboflavina',
  'Niacina',
  'Vitamina B6',
  'Vitamina B12',
  'Vitamina C',
  'Equivalente de folato',
  'Sal de adi��o',
  'A��car de adi��o',
].join(';');

const values = (...first: string[]) =>
  [...first, ...Array(TBCA_COLUMNS.length - first.length).fill('0')].join(';');

describe('parseCsv', () => {
  it('separa por ";", entende aspas e CRLF', () => {
    expect(parseCsv('a;"b; ""c""";d\r\n1;2;3\r\n\r\n')).toEqual([
      ['a', 'b; "c"', 'd'],
      ['1', '2', '3'],
    ]);
  });
});

describe('parseTbcaValue', () => {
  it('vírgula decimal, traço vale 0, NA e "-" sem dado', () => {
    expect(parseTbcaValue('20,4')).toBe(20.4);
    expect(parseTbcaValue('tr')).toBe(0);
    expect(parseTbcaValue('NA')).toBeNull();
    expect(parseTbcaValue('-')).toBeNull();
    expect(parseTbcaValue('')).toBeNull();
    expect(parseTbcaValue('abc')).toBeUndefined();
  });
});

describe('cleanTbcaName', () => {
  it('tira tags HTML, espaços repetidos e a vírgula do fim', () => {
    expect(cleanTbcaName('Óleo, amendoim, <i>Arachis hypogaea</i> L., ')).toBe(
      'Óleo, amendoim, Arachis hypogaea L.',
    );
  });
});

describe('parseTbca', () => {
  it('lê as colunas pela posição e a categoria pela letra do id', () => {
    const { foods, warnings } = parseTbca(
      [
        HEADER,
        `C0019D;Óleo, abacate, Persea americana, ;${values('3700', '900', '0', '0', '0', '0', '100')}`,
        `X1;Inválido;${values()}`,
      ].join('\r\n'),
    );
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({
      id: 'C0019D',
      nome: 'Óleo, abacate, Persea americana',
      categoria: 'Gorduras e óleos',
      energia_kcal: 900,
      lipideos_g: 100,
    });
    expect(warnings).toEqual(['linha 3: id inválido ("X1"), linha ignorada.']);
  });

  it('cabeçalho diferente → erro', () => {
    expect(() => parseTbca('id;nome\r\n')).toThrow(/Cabeçalho inesperado/);
  });
});
