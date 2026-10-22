import { Column, Entity, PrimaryColumn } from 'typeorm';
import { numericTransformer } from './transformers.js';

/**
 * Alimento da TBCA (Tabela Brasileira de Composição de Alimentos), como no CSV `data/tbca/`: valores por
 * 100 g, `null` = sem dado (`NA`, `-` ou vazio), 0 = traço (`tr`).
 */
@Entity('tbca_alimentos')
export class TbcaFoodEntity {
  /** Id da TBCA (ex.: `C0019D`; a letra do fim é a categoria). */
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  nome: string;

  /** Categoria da TBCA, derivada da letra do fim do id. */
  @Column('text')
  categoria: string;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  energia_kj: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  energia_kcal: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  umidade_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  carboidrato_total_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  carboidrato_disponivel_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  proteina_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  lipideos_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  fibra_alimentar_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  alcool_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  cinzas_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  colesterol_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  saturados_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  monoinsaturados_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  poliinsaturados_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  trans_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  calcio_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  ferro_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  sodio_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  magnesio_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  fosforo_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  potassio_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  zinco_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  cobre_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  selenio_mcg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  re_mcg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  rae_mcg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  vitamina_d_mcg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  vitamina_e_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  tiamina_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  riboflavina_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  niacina_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  piridoxina_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  vitamina_b12_mcg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  vitamina_c_mg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  folato_mcg: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  sal_adicao_g: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  acucar_adicao_g: number | null;
}
