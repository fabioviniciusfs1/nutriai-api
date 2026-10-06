// Planilha da TACO (Tabela Brasileira de Composição de Alimentos) → registros por alimento.
// A pag1 tem energia, macro e micronutrientes; a pag2, as gorduras. As duas usam o mesmo `id`.
import type { OdsSheet } from '../ods.js';

/** Colunas numéricas da pag1, com os nomes do cabeçalho (são os nomes das colunas no banco). */
export const TACO_PAGE1_COLUMNS = [
  'energia_kcal',
  'energia_kj',
  'proteina_g',
  'lipideos_g',
  'colesterol_mg',
  'carboidrato_g',
  'fibra_alimentar_g',
  'cinzas_g',
  'calcio_mg',
  'magnesio_mg',
  'manganes_mg',
  'fosforo_mg',
  'ferro_mg',
  'sodio_mg',
  'potassio_mg',
  'cobre_mg',
  'zinco_mg',
  'retinol_mcg',
  're_mcg',
  'rae_mcg',
  'tiamina_mg',
  'riboflavina_mg',
  'piridoxina_mg',
  'niacina_mg',
  'vitamina_c_mg',
] as const;

/** Colunas numéricas da pag2. */
export const TACO_PAGE2_COLUMNS = [
  'saturados_g',
  'monoinsaturados_g',
  'poliinsaturados_g',
] as const;

export const TACO_COLUMNS = [
  ...TACO_PAGE1_COLUMNS,
  ...TACO_PAGE2_COLUMNS,
] as const;

export type TacoColumn = (typeof TACO_COLUMNS)[number];

export type TacoFood = { id: number; nome: string; categoria: string } & Record<
  TacoColumn,
  number | null
>;

/**
 * Nomes corrigidos à mão (id → nome): erros da planilha.
 * - 540: a pag1 traz só "L"; a pag2 traz o nome certo.
 */
const NAME_FIXES: Record<number, string> = { 540: 'Feijoada' };

/** Categorias da TACO por faixa de id (a planilha não tem a coluna). */
export const TACO_CATEGORIES: { from: number; to: number; name: string }[] = [
  { from: 1, to: 63, name: 'Cereais e derivados' },
  { from: 64, to: 162, name: 'Verduras, hortaliças e derivados' },
  { from: 163, to: 258, name: 'Frutas e derivados' },
  { from: 259, to: 272, name: 'Gorduras e óleos' },
  { from: 273, to: 322, name: 'Pescados e frutos do mar' },
  { from: 323, to: 445, name: 'Carnes e derivados' },
  { from: 446, to: 469, name: 'Leite e derivados' },
  { from: 470, to: 483, name: 'Bebidas' },
  { from: 484, to: 490, name: 'Ovos e derivados' },
  { from: 491, to: 510, name: 'Produtos açucarados' },
  { from: 511, to: 519, name: 'Miscelâneas' },
  { from: 520, to: 524, name: 'Outros alimentos industrializados' },
  { from: 525, to: 556, name: 'Alimentos preparados' },
  { from: 557, to: 586, name: 'Leguminosas e derivados' },
  { from: 587, to: 597, name: 'Nozes e sementes' },
];

export function tacoCategory(id: number): string {
  const category = TACO_CATEGORIES.find(
    (item) => id >= item.from && id <= item.to,
  );
  if (!category) throw new Error(`id ${id} fora das categorias da TACO`);
  return category.name;
}

/**
 * Valor de uma célula, como exibido: `*` (não analisado), `NA` (não aplicável) e vazio → `null`;
 * `Tr` (traço) → 0; decimais com vírgula. `undefined` = valor que não dá para ler.
 */
export function parseTacoValue(
  raw: string | undefined,
): number | null | undefined {
  const text = (raw ?? '').trim();
  if (text === '' || text === '*' || text.toUpperCase() === 'NA') return null;
  if (text.toLowerCase() === 'tr') return 0;
  // Corrige uma vírgula a mais no começo (",0,02" → "0,02").
  const normalized = text.replace(/^,(?=\d)/, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : undefined;
}

/** Nome sem espaços nas pontas nem repetidos ("Coco,  verde" → "Coco, verde"). */
function cleanName(name: string | undefined) {
  return (name ?? '').trim().replace(/\s+/g, ' ');
}

function checkHeader(sheet: OdsSheet, columns: readonly string[]) {
  const header = sheet.rows[0]?.map((cell) => cell.trim()) ?? [];
  const expected = ['id', 'nome', ...columns];
  const same =
    expected.every((column, index) => header[index] === column) &&
    header.length === expected.length;
  if (!same) {
    throw new Error(
      `Cabeçalho inesperado na página "${sheet.name}". Esperado: ${expected.join(', ')}. Encontrado: ${header.join(', ')}.`,
    );
  }
}

/** Linhas de dados de uma página: id, nome e os valores das colunas. */
function readPage(
  sheet: OdsSheet,
  columns: readonly TacoColumn[],
  warnings: string[],
) {
  checkHeader(sheet, columns);
  const rows = new Map<
    number,
    { nome: string; values: Partial<Record<TacoColumn, number | null>> }
  >();
  for (const [index, row] of sheet.rows.slice(1).entries()) {
    const line = index + 2;
    const id = Number(row[0]?.trim());
    if (!Number.isInteger(id) || id <= 0) {
      warnings.push(
        `${sheet.name}, linha ${line}: id inválido ("${row[0] ?? ''}"), linha ignorada.`,
      );
      continue;
    }
    if (rows.has(id)) throw new Error(`${sheet.name}: id ${id} repetido.`);
    const values: Partial<Record<TacoColumn, number | null>> = {};
    columns.forEach((column, offset) => {
      const raw = row[offset + 2];
      const value = parseTacoValue(raw);
      if (value === undefined) {
        warnings.push(
          `${sheet.name}, id ${id}, ${column}: valor "${raw}" ilegível, gravado como nulo.`,
        );
        values[column] = null;
        return;
      }
      if (raw?.trim().startsWith(',')) {
        warnings.push(
          `${sheet.name}, id ${id}, ${column}: valor "${raw}" lido como ${value}.`,
        );
      }
      values[column] = value;
    });
    rows.set(id, { nome: cleanName(row[1]), values });
  }
  return rows;
}

/** Junta as duas páginas pelo `id`. Avisa sobre nomes diferentes e valores corrigidos. */
export function parseTaco(sheets: OdsSheet[]): {
  foods: TacoFood[];
  warnings: string[];
} {
  const [page1, page2] = sheets;
  if (!page1 || !page2)
    throw new Error('A planilha da TACO deve ter duas páginas (pag1 e pag2).');
  const warnings: string[] = [];
  const main = readPage(page1, TACO_PAGE1_COLUMNS, warnings);
  const fats = readPage(page2, TACO_PAGE2_COLUMNS, warnings);

  for (const id of fats.keys()) {
    if (!main.has(id))
      warnings.push(
        `${page2.name}: id ${id} não existe na ${page1.name}, ignorado.`,
      );
  }

  const foods = [...main.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, { nome, values }]) => {
      const fat = fats.get(id);
      const fixed = NAME_FIXES[id];
      if (fixed && fixed !== nome)
        warnings.push(`id ${id}: nome "${nome}" corrigido para "${fixed}".`);
      else if (fat && fat.nome !== nome) {
        warnings.push(
          `id ${id}: nome diferente nas páginas ("${nome}" x "${fat.nome}"); usado o da ${page1.name}.`,
        );
      }
      const food = {
        id,
        nome: fixed ?? nome,
        categoria: tacoCategory(id),
      } as TacoFood;
      for (const column of TACO_PAGE1_COLUMNS)
        food[column] = values[column] ?? null;
      for (const column of TACO_PAGE2_COLUMNS)
        food[column] = fat?.values[column] ?? null;
      return food;
    });
  return { foods, warnings };
}
