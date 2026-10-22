// CSV da TBCA (Tabela Brasileira de Composição de Alimentos) → registros por alimento.
// Separador `;`, vírgula decimal, `NA` = sem dado. O cabeçalho vem com os acentos quebrados, então as
// colunas são lidas pela posição (conferida pelos nomes sem acento).

/** Colunas numéricas, na ordem do arquivo (são os nomes das colunas no banco). */
export const TBCA_COLUMNS = [
  'energia_kj',
  'energia_kcal',
  'umidade_g',
  'carboidrato_total_g',
  'carboidrato_disponivel_g',
  'proteina_g',
  'lipideos_g',
  'fibra_alimentar_g',
  'alcool_g',
  'cinzas_g',
  'colesterol_mg',
  'saturados_g',
  'monoinsaturados_g',
  'poliinsaturados_g',
  'trans_g',
  'calcio_mg',
  'ferro_mg',
  'sodio_mg',
  'magnesio_mg',
  'fosforo_mg',
  'potassio_mg',
  'zinco_mg',
  'cobre_mg',
  'selenio_mcg',
  're_mcg',
  'rae_mcg',
  'vitamina_d_mcg',
  'vitamina_e_mg',
  'tiamina_mg',
  'riboflavina_mg',
  'niacina_mg',
  'piridoxina_mg',
  'vitamina_b12_mcg',
  'vitamina_c_mg',
  'folato_mcg',
  'sal_adicao_g',
  'acucar_adicao_g',
] as const;

export type TbcaColumn = (typeof TBCA_COLUMNS)[number];

export type TbcaFood = { id: string; nome: string; categoria: string } & Record<
  TbcaColumn,
  number | null
>;

/** Nomes do cabeçalho conferidos (os que não têm acento), pela posição. */
const HEADER_CHECK: Record<number, string> = {
  0: 'ID',
  1: 'ALIMENTO',
  2: 'Energia KJ',
  3: 'Energia Kcal',
  9: 'Fibra alimentar',
  18: 'Ferro',
  26: 'Vitamina A (RE)',
  27: 'Vitamina A (RAE)',
  35: 'Vitamina C',
};

/** Categorias da TBCA pela letra no fim do id (nomes como os da TACO, onde existem). */
export const TBCA_CATEGORIES: Record<string, string> = {
  A: 'Cereais e derivados',
  B: 'Verduras, hortaliças e derivados',
  C: 'Frutas e derivados',
  D: 'Gorduras e óleos',
  E: 'Pescados e frutos do mar',
  F: 'Carnes e derivados',
  G: 'Leite e derivados',
  H: 'Bebidas',
  J: 'Ovos e derivados',
  K: 'Produtos açucarados',
  L: 'Miscelâneas',
  M: 'Fast food',
  N: 'Alimentos para fins especiais',
  R: 'Outros alimentos industrializados',
  T: 'Leguminosas e derivados',
  U: 'Nozes e sementes',
};

const ID = /^[A-Z]\d{4}[A-Z]$/;

/** Linhas do CSV (separador `;`, campos entre aspas com `""` para aspas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ';') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/**
 * Valor de uma célula, como exibido: `NA`, `-` e vazio → `null`; `tr` (traço) → 0; decimais com vírgula.
 * `undefined` = ilegível.
 */
export function parseTbcaValue(
  raw: string | undefined,
): number | null | undefined {
  const text = (raw ?? '').trim();
  if (text === '' || text === '-' || text.toUpperCase() === 'NA') return null;
  if (text.toLowerCase() === 'tr') return 0;
  const normalized = text.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : undefined;
}

/** Nome sem tags HTML (`<i>…</i>`), espaços repetidos e vírgula no fim. */
export function cleanTbcaName(name: string) {
  return name
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/,$/, '')
    .trim();
}

export function parseTbca(text: string): {
  foods: TbcaFood[];
  warnings: string[];
} {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  const wrong = Object.entries(HEADER_CHECK).filter(
    ([index, name]) => header?.[Number(index)]?.trim() !== name,
  );
  if (!header || wrong.length > 0) {
    throw new Error(
      `Cabeçalho inesperado no CSV da TBCA: ${wrong.map(([index, name]) => `coluna ${Number(index) + 1} deveria ser "${name}"`).join(', ')}.`,
    );
  }

  const warnings: string[] = [];
  const foods = new Map<string, TbcaFood>();
  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const id = row[0]?.trim() ?? '';
    const categoria = TBCA_CATEGORIES[id.slice(-1)];
    if (!ID.test(id) || !categoria) {
      warnings.push(`linha ${line}: id inválido ("${id}"), linha ignorada.`);
      continue;
    }
    if (foods.has(id)) throw new Error(`TBCA: id ${id} repetido.`);
    const food = {
      id,
      nome: cleanTbcaName(row[1] ?? ''),
      categoria,
    } as TbcaFood;
    TBCA_COLUMNS.forEach((column, offset) => {
      const raw = row[offset + 2];
      const value = parseTbcaValue(raw);
      if (value === undefined)
        warnings.push(
          `id ${id}, ${column}: valor "${raw}" ilegível, gravado como nulo.`,
        );
      food[column] = value ?? null;
    });
    foods.set(id, food);
  }
  return { foods: [...foods.values()], warnings };
}
