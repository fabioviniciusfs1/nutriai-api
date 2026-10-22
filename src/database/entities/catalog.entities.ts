import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';
import type { FoodGroup, MealSlot } from '../../contract.js';
import type { AnimalTag } from '../../plan/engine/diet.js';
import type { PlanFood } from '../../plan/engine/types.js';

type Per100g = { carbs: number; protein: number; fat: number; kcal: number };

/** Alimento do catálogo do app, com nutrientes por 100 g. Vem de uma fonte (TACO, TBCA). */
@Entity('foods')
@Unique(['source', 'sourceId'])
export class FoodEntity {
  @PrimaryColumn('text')
  name: string;

  /** `null` = sem grupo: aparece na busca, mas não tem substitutos. */
  @Column('text', { nullable: true })
  group: FoodGroup | null;

  @Column('jsonb')
  per100g: Per100g;

  /** Origens animais (carne, pescado, ovo, leite, mel), para o tipo de alimentação. */
  @Column('text', { array: true, default: [] })
  animal: AnimalTag[];

  /** Outros nutrientes por 100 g (id do nutriente → valor), quando conhecidos. */
  @Column('jsonb', { name: 'micros_per100g', default: {} })
  microsPer100g: Record<string, number>;

  /** Fonte do alimento (`taco`, `tbca`) e o id dele lá. */
  @Column('text')
  source: string;

  @Column('text', { name: 'source_id' })
  sourceId: string;
}

/** Refeição do plano base. */
@Entity('base_meals')
export class BaseMealEntity {
  @PrimaryColumn('int')
  id: number;

  @Column('text')
  title: string;

  @Column('text')
  time: string;

  @Column('jsonb')
  foods: PlanFood[];

  /** Qual refeição do dia ela é: entra no plano de quem marcou essa refeição na rotina. */
  @Column('text')
  slot: MealSlot;
}

export type NutrientSection =
  'macros' | 'fibers' | 'otherMacros' | 'vitamins' | 'minerals';

/** Nutriente acompanhado: meta diária e onde aparece. */
@Entity('nutrient_defs')
export class NutrientDefEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  unit: string;

  @Column('double precision')
  meta: number;

  /** `meta` é um máximo. */
  @Column('boolean', { default: false })
  limit: boolean;

  @Column('text')
  section: NutrientSection;

  /** Grupo do seletor do histórico ("Macronutrientes", "Vitaminas", "Minerais"). */
  @Column('text', { name: 'group_name' })
  groupName: string;

  @Column('int')
  position: number;
}
