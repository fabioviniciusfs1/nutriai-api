// Alimento da TBCA → alimento do catálogo do app (o que o plano, as trocas e a busca usam).
import type { FoodGroup } from '../../../contract.js';
import { animalTags } from '../../../plan/engine/diet.js';
import type { CatalogSourceFood } from '../catalog-food.js';
import type { TbcaColumn, TbcaFood } from './parse.js';

export const TBCA_SOURCE = 'tbca';

/** Grupo do app por categoria da TBCA; `null` = sem substitutos (bebidas, fast food, industrializados…). */
const GROUP_BY_CATEGORY: Record<string, FoodGroup | null> = {
  'Cereais e derivados': 'carboidratos',
  'Verduras, hortaliças e derivados': 'vegetais',
  'Frutas e derivados': 'frutas',
  'Gorduras e óleos': 'gorduras',
  'Pescados e frutos do mar': 'proteinas',
  'Carnes e derivados': 'proteinas',
  'Leite e derivados': 'laticinios',
  Bebidas: null,
  'Ovos e derivados': 'proteinas',
  'Produtos açucarados': 'adocantes',
  Miscelâneas: null,
  'Fast food': null,
  'Alimentos para fins especiais': null,
  'Outros alimentos industrializados': null,
  'Leguminosas e derivados': 'proteinas',
  'Nozes e sementes': 'gorduras',
};

/** Nutriente acompanhado pelo app (id em `nutrient_defs`) ← coluna da TBCA (ela não tem manganês). */
const MICROS: Record<string, TbcaColumn> = {
  fibras: 'fibra_alimentar_g',
  'gordura-saturada': 'saturados_g',
  colesterol: 'colesterol_mg',
  'vitamina-a': 'rae_mcg',
  tiamina: 'tiamina_mg',
  riboflavina: 'riboflavina_mg',
  niacina: 'niacina_mg',
  piridoxina: 'piridoxina_mg',
  'vitamina-c': 'vitamina_c_mg',
  calcio: 'calcio_mg',
  ferro: 'ferro_mg',
  magnesio: 'magnesio_mg',
  fosforo: 'fosforo_mg',
  potassio: 'potassio_mg',
  sodio: 'sodio_mg',
  cobre: 'cobre_mg',
  zinco: 'zinco_mg',
};

/**
 * O alimento no formato do catálogo; `null` se a TBCA não tem a energia dele. Macronutriente sem valor vale 0;
 * o carboidrato é o total (como na TACO).
 */
export function tbcaToCatalog(food: TbcaFood): CatalogSourceFood | null {
  if (food.energia_kcal === null) return null;
  const microsPer100g: Record<string, number> = {};
  for (const [id, column] of Object.entries(MICROS)) {
    const value = food[column];
    if (value !== null) microsPer100g[id] = value;
  }
  return {
    name: food.nome,
    group: GROUP_BY_CATEGORY[food.categoria] ?? null,
    per100g: {
      kcal: food.energia_kcal,
      protein: food.proteina_g ?? 0,
      fat: food.lipideos_g ?? 0,
      carbs: food.carboidrato_total_g ?? 0,
    },
    animal: animalTags(food.categoria, food.nome),
    microsPer100g,
    source: TBCA_SOURCE,
    sourceId: food.id,
  };
}
