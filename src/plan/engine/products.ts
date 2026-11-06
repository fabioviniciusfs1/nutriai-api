import type { Totals } from './types.js';

/**
 * Produto industrializado (Open Food Facts, tabela `off_products`), achado pelo código de barras ou pelo nome. Só
 * entra no plano como alimento extra: fica fora do catálogo do engine (sem grupo, sem substitutos).
 */
export type Product = {
  /** Nome para mostrar: o do produto, com a marca entre parênteses quando ela não está no nome. */
  name: string;
  barcode: string;
  brand: string | null;
  per100g: Totals;
  /** Porção da embalagem em gramas, quando informada (o valor inicial das gramas). */
  servingG: number | null;
};

/** Código de barras (EAN-8, UPC-A, EAN-13, GTIN-14): só dígitos, de 8 a 14. */
export const BARCODE = /^\d{8,14}$/;

export const isBarcode = (text: string) => BARCODE.test(text.trim());

/**
 * As formas do mesmo código na base: o UPC-A (12 dígitos) é o EAN-13 com um zero na frente, e o Open Food Facts
 * guarda alguns com zeros à esquerda e outros sem.
 */
export function barcodeVariants(code: string): string[] {
  const digits = code.trim();
  const bare = digits.replace(/^0+/, '');
  return [
    ...new Set(
      [
        digits,
        bare,
        ...[8, 12, 13, 14].map((size) => bare.padStart(size, '0')),
      ].filter((variant) => BARCODE.test(variant)),
    ),
  ];
}
