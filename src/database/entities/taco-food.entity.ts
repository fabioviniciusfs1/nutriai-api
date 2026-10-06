import { Column, Entity, PrimaryColumn } from 'typeorm';
import { numericTransformer } from './transformers.js';

/**
 * Alimento da TACO (Tabela Brasileira de Composição de Alimentos), como na planilha
 * `data/taco/tabela-taco.ods`: valores por 100 g, `null` = sem dado (`*`, `NA` ou vazio), 0 = traço (`Tr`).
 */
@Entity('taco_alimentos')
export class TacoFoodEntity {
  /** Id da TACO (o mesmo nas duas páginas da planilha). */
  @PrimaryColumn('int')
  id: number;

  @Column('text')
  nome: string;

  /** Categoria da TACO, derivada da faixa de id. */
  @Column('text')
  categoria: string;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  energia_kcal: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  energia_kj: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  proteina_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  lipideos_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  colesterol_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  carboidrato_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  fibra_alimentar_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  cinzas_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  calcio_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  magnesio_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  manganes_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  fosforo_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  ferro_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  sodio_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  potassio_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  cobre_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  zinco_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  retinol_mcg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  re_mcg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  rae_mcg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  tiamina_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  riboflavina_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  piridoxina_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  niacina_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  vitamina_c_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  saturados_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  monoinsaturados_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  poliinsaturados_g: number | null;
}
