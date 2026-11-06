// Linhas do arquivo filtrado do Open Food Facts (`scripts/filter-off.mjs` → `data/off/off-products.jsonl.gz`).
import { normalize } from '../../../plan/engine/foods.js';
import { BARCODE } from '../../../plan/engine/products.js';

/** Linha da tabela `off_products`. */
export type OffRow = {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  servingG: number | null;
  countries: string[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sodiumMg: number | null;
  searchName: string;
};

/** Nome para mostrar: o do produto, com a marca entre parênteses quando ela não está no nome. */
export function offDisplayName(name: string, brand: string | null) {
  return brand && !normalize(name).includes(normalize(brand))
    ? `${name} (${brand})`
    : name;
}

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Texto limpo: sem o caractere nulo nem pedaços de UTF-16 soltos, que o Postgres não aceita. */
function text(value: unknown) {
  if (typeof value !== 'string') return null;
  const clean = value
    .replace(LONE_SURROGATE, '�')
    .split('\u0000')
    .join('')
    .trim();
  return clean || null;
}

const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;

/** Uma linha do arquivo filtrado como `off_products`; `null` se faltar código, nome, kcal ou macro. */
export function offRow(json: unknown): OffRow | null {
  if (typeof json !== 'object' || json === null) return null;
  const line = json as Record<string, unknown>;
  const code = text(line.code);
  const name = text(line.name);
  const [kcal, protein, carbs, fat] = [
    line.kcal,
    line.protein,
    line.carbs,
    line.fat,
  ].map(number);
  if (
    !code ||
    !BARCODE.test(code) ||
    !name ||
    kcal === null ||
    protein === null ||
    carbs === null ||
    fat === null
  )
    return null;
  const brand = text(line.brand);
  const servingG = number(line.servingG);
  return {
    code,
    name,
    brand,
    quantity: text(line.quantity),
    servingG: servingG && servingG > 0 ? servingG : null,
    countries: Array.isArray(line.countries)
      ? line.countries.flatMap((country) => text(country) ?? [])
      : [],
    kcal,
    protein,
    carbs,
    fat,
    fiber: number(line.fiber),
    sodiumMg: number(line.sodiumMg),
    searchName: normalize(offDisplayName(name, brand)),
  };
}
