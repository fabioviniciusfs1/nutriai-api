// Tipo de alimentação do perfil: o que cada dieta exclui, pela origem animal de cada alimento do catálogo.
// A origem vem da categoria da TACO e, nos preparados e industrializados, de palavras do nome.
import type { Diet } from '../../contract.js';
import { normalize } from './foods.js';

/** De que origem animal o alimento tem algo. */
export type AnimalTag = 'carne' | 'pescado' | 'ovo' | 'leite' | 'mel';

const BY_CATEGORY: Record<string, AnimalTag> = {
  'Carnes e derivados': 'carne',
  'Pescados e frutos do mar': 'pescado',
  'Ovos e derivados': 'ovo',
  'Leite e derivados': 'leite',
};

/** Palavras do nome (sem acento, minúsculas) que indicam cada origem, para os pratos e industrializados. */
const BY_NAME: [AnimalTag, RegExp][] = [
  [
    'carne',
    /\b(carnes?|frango|bife|bacon|presunto|linguica|calabresa|salsicha|mortadela|salame|feijoada|tropeiro|bolognesa|dobradinha|sarapatel|barreado|manicoba|vaca atolada|carreteiro|virado a paulista|charuto|yakisoba|gelatina|quibebe|baiao de dois)\b/,
  ],
  [
    'pescado',
    /\b(peixe|atum|sardinha|camarao|bacalhau|acaraje|vatapa|tacaca|cuxa|cuscuz paulista)\b/,
  ],
  [
    'ovo',
    /\b(ovos?|maionese|bife a cavalo|quindim|bolinho de arroz|bolo|cuscuz paulista|tropeiro)\b/,
  ],
  [
    'leite',
    /\b(leite|queijo|manteiga|iogurte|requeijao|creme de leite|chantilly|capuccino|achocolatado|bolo|cocada|baiao de dois)\b/,
  ],
  ['mel', /\bmel de abelha\b/],
];

/** Nomes que têm as palavras acima sem ser de origem animal. */
const NOT_ANIMAL = /\b(leite de coco|tofu)\b/;

/** Origens animais do alimento, pela categoria da TACO e pelo nome. */
export function animalTags(category: string, name: string): AnimalTag[] {
  const tags = new Set<AnimalTag>();
  if (BY_CATEGORY[category]) tags.add(BY_CATEGORY[category]);
  const normalized = normalize(name);
  if (!NOT_ANIMAL.test(normalized))
    for (const [tag, pattern] of BY_NAME)
      if (pattern.test(normalized)) tags.add(tag);
  return [...tags].sort();
}

/** O que cada tipo de alimentação não come. */
const EXCLUDED: Record<Diet, AnimalTag[]> = {
  onivora: [],
  pescetariana: ['carne'],
  vegetariana: ['carne', 'pescado'],
  vegana: ['carne', 'pescado', 'ovo', 'leite', 'mel'],
};

/** O alimento cabe na dieta. */
export function allowedByDiet(food: { animal?: AnimalTag[] }, diet: Diet) {
  return !(food.animal ?? []).some((tag) => EXCLUDED[diet].includes(tag));
}

export const DIET_NAMES: Record<Diet, string> = {
  onivora: 'sem restrição (come de tudo)',
  pescetariana:
    'pescetariana (sem carnes; come peixes e frutos do mar, ovos e laticínios)',
  vegetariana:
    'vegetariana (sem carnes, peixes e frutos do mar; come ovos e laticínios)',
  vegana:
    'vegana (nada de origem animal: sem carnes, peixes, ovos, laticínios e mel)',
};
