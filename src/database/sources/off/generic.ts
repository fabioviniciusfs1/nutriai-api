// Alimento genérico, sem marca, feito dos produtos do Open Food Facts: entra no catálogo quando o assistente cita
// um alimento que não existe na TACO nem na TBCA ("Queijo, cottage", "Granola"). Os macros são a mediana dos
// produtos vendidos no Brasil que têm as palavras do nome.
import type { FoodGroup } from '../../../contract.js';
import { animalTags, type AnimalTag } from '../../../plan/engine/diet.js';
import {
  type ApproxPer100g,
  FoodCatalog,
  kcalGap,
  MAX_KCAL_GAP,
  normalize,
} from '../../../plan/engine/foods.js';
import type { CatalogSourceFood } from '../catalog-food.js';

/** Fonte dos genéricos em `foods.source`. */
export const OFF_GENERIC_SOURCE = 'off';

/** Mínimo de produtos para a mediana valer. */
export const MIN_PRODUCTS = 3;

/** Palavras mais curtas não entram na consulta (o índice trigram precisa de 3 letras). */
const MIN_WORD = 3;

const MAX_NAME = 80;

/**
 * Diferença de calorias entre o par do catálogo e o que o assistente informou acima da qual, com uma palavra que o
 * catálogo não conhece no nome, vale procurar no Open Food Facts ("Queijo, cottage" → "Queijo, ricota": 98 × 140).
 */
const UNKNOWN_WORD_GAP = 0.2;

/** Medianas por 100 g dos produtos encontrados. */
export type OffStats = {
  count: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number | null;
  sodiumMg: number | null;
};

/** Palavras do nome para procurar os produtos (`search_name LIKE`, cada uma). */
export function offSearchWords(name: string): string[] {
  return [
    ...new Set(
      normalize(name)
        .split(' ')
        .filter((word) => word.length >= MIN_WORD),
    ),
  ];
}

/**
 * O alimento citado precisa do Open Food Facts: não tem par no catálogo, ou tem uma palavra que o catálogo não
 * conhece e o par ficou com calorias bem diferentes das informadas (o `match` pesa essa palavra o mínimo).
 */
export function needsOffFood(
  catalog: FoodCatalog,
  name: string,
  approx: ApproxPer100g | undefined,
): boolean {
  const matched = catalog.match(name, approx);
  if (!matched) return true;
  const kcal = catalog.entry(matched)?.per100g.kcal;
  return (
    approx?.kcal !== undefined &&
    kcal !== undefined &&
    catalog.unknownWords(name).length > 0 &&
    kcalGap(kcal, approx.kcal) > UNKNOWN_WORD_GAP
  );
}

/** Nome do genérico: o citado, sem espaços sobrando e com a 1ª letra maiúscula. */
function genericName(name: string) {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Alimentos do catálogo da mesma família (1ª parte do nome: "Queijo, cottage" → os queijos). */
function sameFamily(catalog: FoodCatalog, name: string) {
  const family = normalize(name.split(',')[0]);
  return catalog.foods.filter(
    (food) => normalize(food.name.split(',')[0]) === family,
  );
}

/**
 * O genérico do alimento citado, pelas medianas `stats`, ou `null` se há poucos produtos, se as calorias ficam longe
 * das informadas ou se não ficam mais perto delas que o par do catálogo. Grupo: o mais comum da família no catálogo
 * (sem família, sem grupo); origens animais pelo nome e pela família.
 */
export function genericFood(
  catalog: FoodCatalog,
  name: string,
  approx: ApproxPer100g | undefined,
  stats: OffStats,
): CatalogSourceFood | null {
  if (stats.count < MIN_PRODUCTS || !(stats.kcal > 0)) return null;
  if (approx?.kcal !== undefined && approx.kcal > 0) {
    const gap = kcalGap(stats.kcal, approx.kcal);
    if (gap > MAX_KCAL_GAP) return null;
    const matched = catalog.match(name, approx);
    const kcal = matched ? catalog.entry(matched)?.per100g.kcal : undefined;
    if (kcal !== undefined && kcalGap(kcal, approx.kcal) <= gap) return null;
  }

  const fullName = genericName(name);
  const family = sameFamily(catalog, fullName);
  const groups = new Map<FoodGroup, number>();
  for (const food of family)
    if (food.group) groups.set(food.group, (groups.get(food.group) ?? 0) + 1);
  const group =
    [...groups].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ??
    null;
  const animal = new Set<AnimalTag>([
    ...animalTags('', fullName),
    ...family.flatMap((food) => food.animal ?? []),
  ]);

  const round = (value: number) => Math.round(value * 10) / 10;
  const micros: Record<string, number> = {};
  if (stats.fiber !== null) micros.fibras = round(stats.fiber);
  if (stats.sodiumMg !== null) micros.sodio = Math.round(stats.sodiumMg);
  return {
    name: fullName,
    group,
    per100g: {
      kcal: Math.round(stats.kcal),
      protein: round(stats.protein),
      fat: round(stats.fat),
      carbs: round(stats.carbs),
    },
    animal: [...animal].sort(),
    microsPer100g: micros,
    source: OFF_GENERIC_SOURCE,
    sourceId: normalize(fullName),
  };
}
