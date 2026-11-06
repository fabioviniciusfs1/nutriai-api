import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Produto do Open Food Facts (`data/off/off-products.jsonl.gz`, filtrado por `scripts/filter-off.mjs`): valores
 * por 100 g. Fica fora do catálogo do app (`foods`): só o alimento extra procura aqui.
 */
@Entity('off_products')
export class OffProductEntity {
  /** Código de barras (8 a 14 dígitos). */
  @PrimaryColumn('text')
  code: string;

  @Column('text')
  name: string;

  @Column('text', { nullable: true })
  brand: string | null;

  /** Quantidade da embalagem, como no rótulo (ex.: "395 g"). */
  @Column('text', { nullable: true })
  quantity: string | null;

  @Column('real', { name: 'serving_g', nullable: true })
  servingG: number | null;

  /** Países onde é vendido (`en:brazil`…). */
  @Column('text', { array: true, default: [] })
  countries: string[];

  @Column('real')
  kcal: number;

  @Column('real')
  protein: number;

  @Column('real')
  carbs: number;

  @Column('real')
  fat: number;

  @Column('real', { nullable: true })
  fiber: number | null;

  @Column('real', { name: 'sodium_mg', nullable: true })
  sodiumMg: number | null;

  /** Nome para mostrar (com a marca) normalizado como na busca (`normalize`), para o índice trigram. */
  @Column('text', { name: 'search_name' })
  searchName: string;
}
