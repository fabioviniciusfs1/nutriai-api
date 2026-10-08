import type { FoodGroup, Totals } from '../../contract.js';
import type { AnimalTag } from '../../plan/engine/diet.js';

/**
 * Alimento como entra no catálogo do app (tabela `foods`), vindo de uma fonte (TACO, …).
 * Cada fonte tem a sua tabela com os dados originais e um mapeador para este formato.
 */
export type CatalogSourceFood = {
  name: string;
  /** `null` = sem grupo: aparece na busca, mas não tem substitutos. */
  group: FoodGroup | null;
  per100g: Totals;
  /** Origens animais (carne, pescado, ovo, leite, mel), para o tipo de alimentação. */
  animal: AnimalTag[];
  /** Nutrientes acompanhados por 100 g (id em `nutrient_defs` → valor). */
  microsPer100g: Record<string, number>;
  source: string;
  sourceId: number;
};
