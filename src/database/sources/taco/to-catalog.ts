// Alimento da TACO → alimento do catálogo do app (o que o plano, as trocas e a busca usam).
import type { FoodGroup } from '../../../contract.js';
import type { CatalogSourceFood } from '../catalog-food.js';
import type { TacoColumn, TacoFood } from './parse.js';

export const TACO_SOURCE = 'taco';

/** Grupo do app por categoria da TACO; `null` = sem substitutos (bebidas, preparados…). */
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
  'Outros alimentos industrializados': null,
  'Alimentos preparados': null,
  'Leguminosas e derivados': 'proteinas',
  'Nozes e sementes': 'gorduras',
};

/** Nutriente acompanhado pelo app (id em `nutrient_defs`) ← coluna(s) da TACO, na ordem de preferência. */
const MICROS: Record<string, TacoColumn[]> = {
  fibras: ['fibra_alimentar_g'],
  'gordura-saturada': ['saturados_g'],
  colesterol: ['colesterol_mg'],
  // RAE cobre os carotenoides (vegetais); nos alimentos de origem animal a TACO só traz o retinol.
  'vitamina-a': ['rae_mcg', 'retinol_mcg'],
  tiamina: ['tiamina_mg'],
  riboflavina: ['riboflavina_mg'],
  niacina: ['niacina_mg'],
  piridoxina: ['piridoxina_mg'],
  'vitamina-c': ['vitamina_c_mg'],
  calcio: ['calcio_mg'],
  ferro: ['ferro_mg'],
  magnesio: ['magnesio_mg'],
  manganes: ['manganes_mg'],
  fosforo: ['fosforo_mg'],
  potassio: ['potassio_mg'],
  sodio: ['sodio_mg'],
  cobre: ['cobre_mg'],
  zinco: ['zinco_mg'],
};

/**
 * O alimento no formato do catálogo; `null` se a TACO não tem a energia dele (não dá para calcular
 * porções). Macronutriente sem valor, com a energia conhecida, vale 0 (ex.: óleos).
 */
export function tacoToCatalog(food: TacoFood): CatalogSourceFood | null {
  if (food.energia_kcal === null) return null;
  const microsPer100g: Record<string, number> = {};
  for (const [id, columns] of Object.entries(MICROS)) {
    const value = columns
      .map((column) => food[column])
      .find((item) => item !== null);
    if (value !== undefined && value !== null) microsPer100g[id] = value;
  }
  return {
    name: food.nome,
    group: GROUP_BY_CATEGORY[food.categoria] ?? null,
    per100g: {
      kcal: food.energia_kcal,
      protein: food.proteina_g ?? 0,
      fat: food.lipideos_g ?? 0,
      carbs: food.carboidrato_g ?? 0,
    },
    microsPer100g,
    source: TACO_SOURCE,
    sourceId: food.id,
  };
}
