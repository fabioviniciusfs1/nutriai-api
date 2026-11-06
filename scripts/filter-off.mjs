// Filtra o dump JSONL do Open Food Facts para um arquivo pequeno (gzip) com o que o plano usa:
// código de barras, nome, marca e nutrientes por 100 g.
// Uso: node scripts/filter-off.mjs <entrada.jsonl> <saida.jsonl.gz>
import { createReadStream, createWriteStream, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Uso: node scripts/filter-off.mjs <entrada.jsonl> <saida.jsonl.gz>');
  process.exit(1);
}

const num = (value) => {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const text = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');
const round = (n, digits = 1) => (n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits);

/** Valor em gramas (ou kcal/kJ) de um nutriente do formato novo, `nutrition.aggregated_set`. */
function fromNew(nutrients, key) {
  const entry = nutrients?.[key];
  const value = num(entry?.value);
  if (value === null) return null;
  switch (entry.unit) {
    case 'mg':
      return value / 1000;
    case 'µg':
    case 'mcg':
      return value / 1e6;
    default:
      return value;
  }
}

function nutrientsOf(product) {
  const old = product.nutriments ?? {};
  const set = product.nutrition?.aggregated_set;
  const fresh = set && set.per === '100g' ? set.nutrients : null;
  const get = (oldKey, newKey) => num(old[oldKey]) ?? fromNew(fresh, newKey);

  let kcal = get('energy-kcal_100g', 'energy-kcal');
  if (kcal === null) {
    const kj = get('energy-kj_100g', 'energy-kj') ?? num(old['energy_100g']);
    if (kj !== null) kcal = kj / 4.184;
  }
  const sodium = get('sodium_100g', 'sodium');
  return {
    kcal,
    protein: get('proteins_100g', 'proteins'),
    carbs: get('carbohydrates_100g', 'carbohydrates'),
    fat: get('fat_100g', 'fat'),
    fiber: get('fiber_100g', 'fiber'),
    sodiumMg: sodium === null ? null : sodium * 1000,
  };
}

const inRange = (n, max) => n !== null && n >= 0 && n <= max;

function toRow(product) {
  const code = text(product.code ?? product._id);
  if (!/^\d{8,14}$/.test(code)) return null;
  const name = text(product.product_name_pt) || text(product.product_name) || text(product.generic_name_pt);
  if (!name) return null;
  const n = nutrientsOf(product);
  if (!inRange(n.kcal, 900) || !inRange(n.protein, 100) || !inRange(n.carbs, 100) || !inRange(n.fat, 100)) {
    return null;
  }
  if (n.protein + n.carbs + n.fat > 105) return null;
  const serving = num(product.serving_quantity);
  return {
    code,
    name,
    brand: text(product.brands).split(',')[0]?.trim() || null,
    quantity: text(product.quantity) || null,
    servingG: serving !== null && serving > 0 && serving <= 2000 ? round(serving) : null,
    countries: Array.isArray(product.countries_tags) ? product.countries_tags : [],
    kcal: Math.round(n.kcal),
    protein: round(n.protein),
    carbs: round(n.carbs),
    fat: round(n.fat),
    fiber: inRange(n.fiber, 100) ? round(n.fiber) : null,
    sodiumMg: inRange(n.sodiumMg, 100000) ? Math.round(n.sodiumMg) : null,
  };
}

mkdirSync(dirname(output), { recursive: true });
const total = statSync(input).size;
const source = createReadStream(input, { highWaterMark: 1 << 20 });
const gzip = createGzip({ level: 6 });
const sink = gzip.pipe(createWriteStream(output));
const seen = new Set();
const stats = { read: 0, kept: 0, invalid: 0, duplicate: 0, brazil: 0 };
const started = Date.now();

const progress = () => {
  const pct = ((source.bytesRead / total) * 100).toFixed(1);
  const min = ((Date.now() - started) / 60000).toFixed(1);
  console.log(
    `${pct}% · ${min} min · lidas ${stats.read} · mantidas ${stats.kept} · Brasil ${stats.brazil} · ` +
      `inválidas ${stats.invalid} · repetidas ${stats.duplicate}`,
  );
};

for await (const line of createInterface({ input: source, crlfDelay: Infinity })) {
  if (!line) continue;
  stats.read++;
  if (stats.read % 500000 === 0) progress();
  let product;
  try {
    product = JSON.parse(line);
  } catch {
    stats.invalid++;
    continue;
  }
  const row = toRow(product);
  if (!row) continue;
  if (seen.has(row.code)) {
    stats.duplicate++;
    continue;
  }
  seen.add(row.code);
  stats.kept++;
  if (row.countries.includes('en:brazil')) stats.brazil++;
  if (!gzip.write(JSON.stringify(row) + '\n')) await once(gzip, 'drain');
}

gzip.end();
await once(sink, 'finish');
progress();
console.log('Concluído:', output);
