import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import type { OffStats } from '../database/sources/off/generic.js';
import { offDisplayName } from '../database/sources/off/parse.js';
import { normalize } from '../plan/engine/foods.js';
import { barcodeVariants, type Product } from '../plan/engine/products.js';

/** Quantos produtos a busca por nome devolve. */
const SEARCH_LIMIT = 10;

/** Palavras mais curtas não entram na busca por nome (o índice trigram precisa de 3 letras). */
const MIN_WORD = 3;

type ProductRow = {
  code: string;
  name: string;
  brand: string | null;
  serving_g: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

const COLUMNS = 'code, name, brand, serving_g, kcal, protein, carbs, fat';

function toProduct(row: ProductRow): Product {
  return {
    name: offDisplayName(row.name, row.brand),
    barcode: row.code,
    brand: row.brand,
    per100g: {
      kcal: row.kcal,
      protein: row.protein,
      carbs: row.carbs,
      fat: row.fat,
    },
    servingG: row.serving_g,
  };
}

/** Produtos do Open Food Facts (`off_products`), para o alimento extra e os genéricos do catálogo. */
@Injectable()
export class OffProductsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** O produto do código de barras (em qualquer das formas do código), ou `null`. */
  async byCode(code: string): Promise<Product | null> {
    const variants = barcodeVariants(code);
    if (!variants.length) return null;
    const rows: ProductRow[] = await this.dataSource.query(
      `SELECT ${COLUMNS} FROM off_products WHERE code = ANY($1) ORDER BY code = $2 DESC, length(code) DESC LIMIT 1`,
      [variants, code.trim()],
    );
    return rows[0] ? toProduct(rows[0]) : null;
  }

  /**
   * Produtos cujo nome (com a marca) tem todas as palavras de `query` (de 3 letras ou mais); primeiro os vendidos
   * no Brasil, depois os mais parecidos com o texto.
   */
  async search(query: string, limit = SEARCH_LIMIT): Promise<Product[]> {
    const normalized = normalize(query);
    const words = [
      ...new Set(
        normalized.split(' ').filter((word) => word.length >= MIN_WORD),
      ),
    ];
    if (!words.length) return [];
    // `normalize` só deixa letras, dígitos e espaço: nada a escapar no LIKE.
    const where = words
      .map((_, index) => `search_name LIKE $${index + 1}`)
      .join(' AND ');
    const rows: ProductRow[] = await this.dataSource.query(
      `SELECT ${COLUMNS} FROM off_products WHERE ${where}
        ORDER BY 'en:brazil' = ANY(countries) DESC,
                 similarity(search_name, $${words.length + 1}) DESC, code
        LIMIT $${words.length + 2}`,
      [...words.map((word) => `%${word}%`), normalized, limit],
    );
    return rows.map(toProduct);
  }

  /**
   * Medianas por 100 g dos produtos vendidos no Brasil com todas as `words` no nome (já normalizadas, como
   * `offSearchWords`), para o genérico do catálogo.
   */
  async medians(words: string[]): Promise<OffStats> {
    if (!words.length)
      return {
        count: 0,
        kcal: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        fiber: null,
        sodiumMg: null,
      };
    const where = words
      .map((_, index) => `search_name LIKE $${index + 1}`)
      .join(' AND ');
    const median = (column: string) =>
      `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${column}) AS ${column}`;
    const [row]: {
      count: string;
      kcal: number | null;
      protein: number | null;
      fat: number | null;
      carbs: number | null;
      fiber: number | null;
      sodium_mg: number | null;
    }[] = await this.dataSource.query(
      `SELECT count(*) AS count, ${['kcal', 'protein', 'fat', 'carbs', 'fiber', 'sodium_mg'].map(median).join(', ')}
        FROM off_products WHERE 'en:brazil' = ANY(countries) AND ${where}`,
      words.map((word) => `%${word}%`),
    );
    return {
      count: Number(row?.count ?? 0),
      kcal: row?.kcal ?? 0,
      protein: row?.protein ?? 0,
      fat: row?.fat ?? 0,
      carbs: row?.carbs ?? 0,
      fiber: row?.fiber ?? null,
      sodiumMg: row?.sodium_mg ?? null,
    };
  }
}
