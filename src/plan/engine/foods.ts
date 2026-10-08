// Porções, trocas e busca de alimentos (porte de `reference/food-substitution.ts` e `AddFoodDialog.tsx`).
// - "Não gosto" e "Não tenho": troca permanente em todas as refeições.
// - "Não quero": troca permanente só na refeição marcada.
// O substituto entra com as mesmas calorias. Liberar o alimento não desfaz trocas já feitas.
import type { FoodFeedback } from '../../contract.js';
import type { CatalogFood, PlanFood, Totals } from './types.js';

/** Evita laço se as trocas formarem um ciclo (A → B → A). */
const MAX_CHAIN = 5;

/** Quantas sugestões devolver quando o texto não bate com nenhum alimento. */
const MAX_SUGGESTIONS = 5;

export function sumTotals(foods: Totals[]): Totals {
  return foods.reduce(
    (totals, food) => ({
      carbs: totals.carbs + food.carbs,
      protein: totals.protein + food.protein,
      fat: totals.fat + food.fat,
      kcal: totals.kcal + food.kcal,
    }),
    { carbs: 0, protein: 0, fat: 0, kcal: 0 },
  );
}

/** Porção dos alimentos multiplicada por `factor` (gramas e nutrientes juntos; gramas no mínimo 1). */
export function scaleFoods<T extends PlanFood>(
  foods: T[],
  factor: number,
): T[] {
  if (factor === 1) return foods;
  return foods.map((food) => ({
    ...food,
    grams: Math.max(1, Math.round(food.grams * factor)),
    carbs: Math.round(food.carbs * factor),
    protein: Math.round(food.protein * factor),
    fat: Math.round(food.fat * factor),
    kcal: Math.round(food.kcal * factor),
  }));
}

/** Fração das calorias que vem de proteína, gordura e carboidrato. */
function macroShares({ per100g }: CatalogFood) {
  const kcal = per100g.kcal || 1;
  return [
    (per100g.protein * 4) / kcal,
    (per100g.fat * 9) / kcal,
    (per100g.carbs * 4) / kcal,
  ];
}

/** Distância entre as proporções de macronutrientes de `original` e de outro alimento. */
function macroDistance(original: CatalogFood) {
  const base = macroShares(original);
  return (food: CatalogFood) =>
    macroShares(food).reduce(
      (sum, share, index) => sum + Math.abs(share - base[index]),
      0,
    );
}

/** Começo do nome na TACO, que indica a família do alimento ("Arroz, tipo 1, cozido" → "arroz"). */
function foodFamily(name: string) {
  return normalize(name.split(',')[0]);
}

/** Alimento cru pelo nome ("…, cru", "…, crua"). */
export function isRaw(name: string) {
  return /\bcrus?\b|\bcruas?\b/.test(normalize(name));
}

export class FoodCatalog {
  private readonly byName: Map<string, CatalogFood>;

  constructor(readonly foods: CatalogFood[]) {
    this.byName = new Map(foods.map((food) => [food.name, food]));
  }

  entry(name: string) {
    return this.byName.get(name);
  }

  /** O alimento `name` numa porção de `grams` gramas, com os nutrientes do catálogo. */
  portion(name: string, grams: number): PlanFood | null {
    const entry = this.entry(name);
    if (!entry) return null;
    const factor = grams / 100;
    return {
      name,
      grams,
      carbs: Math.round(entry.per100g.carbs * factor),
      protein: Math.round(entry.per100g.protein * factor),
      fat: Math.round(entry.per100g.fat * factor),
      kcal: Math.round(entry.per100g.kcal * factor),
    };
  }

  /** O alimento `name` numa porção com as mesmas calorias de `kcal`. */
  convert(name: string, kcal: number): PlanFood | null {
    const entry = this.entry(name);
    if (!entry || entry.per100g.kcal === 0) return null;
    return this.portion(
      name,
      Math.max(1, Math.round((kcal / entry.per100g.kcal) * 100)),
    );
  }

  /**
   * `name` como substituto de `original`, com as mesmas calorias de `kcal`. `null` se não estiver no
   * catálogo, não tiver calorias, for o próprio alimento ou estiver restrito.
   */
  substitute(
    name: string,
    original: string,
    kcal: number,
    feedback: Record<string, FoodFeedback>,
  ): PlanFood | null {
    if (name === original || feedback[name]) return null;
    return this.convert(name, kcal);
  }

  /**
   * Substitutos do mesmo grupo, sem o próprio alimento e sem os restritos, com as mesmas calorias (usado
   * sem o assistente): os `limit` mais parecidos — primeiro os da mesma família (mesmo começo do nome, ex.
   * "Arroz, …"), depois evitando os crus se o original não for cru, e pela proporção de macronutrientes.
   */
  substituteOptions(
    foodName: string,
    kcal: number,
    feedback: Record<string, FoodFeedback>,
    limit: number,
  ): PlanFood[] {
    const original = this.entry(foodName);
    if (!original?.group) return [];
    const distance = macroDistance(original);
    const family = foodFamily(foodName);
    const originalRaw = isRaw(foodName);
    const rank = (food: CatalogFood) => [
      foodFamily(food.name) === family ? 0 : 1,
      !originalRaw && isRaw(food.name) ? 1 : 0,
      distance(food),
    ];
    return this.foods
      .filter(
        (food) =>
          food.group === original.group &&
          food.name !== foodName &&
          !feedback[food.name] &&
          food.per100g.kcal > 0,
      )
      .map((food) => ({ food, rank: rank(food) }))
      .sort(
        (a, b) =>
          a.rank[0] - b.rank[0] ||
          a.rank[1] - b.rank[1] ||
          a.rank[2] - b.rank[2],
      )
      .slice(0, limit)
      .flatMap(({ food }) => this.convert(food.name, kcal) ?? []);
  }

  /**
   * Aplica as trocas (nome → substituto; "" = sai sem substituto), seguindo a cadeia caso o
   * substituto também tenha sido trocado depois.
   */
  resolve(foods: PlanFood[], swaps: Record<string, string>): PlanFood[] {
    return foods.flatMap((food) => {
      let current: PlanFood = food;
      for (let i = 0; i < MAX_CHAIN && swaps[current.name] !== undefined; i++) {
        const converted = this.convert(swaps[current.name], current.kcal);
        if (!converted) return [];
        current = converted;
      }
      return [current];
    });
  }

  /**
   * Busca do "Adicionar alimento": nomes que contêm o texto (sem diferenciar maiúsculas nem acentos);
   * se nenhum, os mais parecidos. Restritos nunca aparecem; `restricted` diz se o texto é um deles.
   */
  search(query: string, feedback: Record<string, FoodFeedback>) {
    const normalized = normalize(query);
    const allowed = this.foods.filter((food) => !feedback[food.name]);
    const matches = allowed.filter((food) =>
      normalize(food.name).includes(normalized),
    );
    const exactRestricted = this.foods.find(
      (food) => normalize(food.name) === normalized && feedback[food.name],
    );
    const candidates =
      matches.length > 0
        ? matches
        : allowed
            .map((food) => ({ food, score: similarity(normalized, food.name) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_SUGGESTIONS)
            .map(({ food }) => food);
    return {
      found: matches.length > 0,
      restricted: exactRestricted
        ? {
            name: exactRestricted.name,
            feedback: feedback[exactRestricted.name],
          }
        : null,
      candidates,
    };
  }
}

/** Se a refeição usa algum alimento restrito (o assistente evita essas sugestões). */
export function usesRestrictedFood(
  foods: { name: string }[],
  feedback: Record<string, FoodFeedback>,
) {
  return foods.some((food) => feedback[food.name]);
}

/** Compara nomes sem diferenciar maiúsculas, acentos nem pontuação ("feijao" encontra "Feijão"). */
export function normalize(text: string) {
  return (
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      // Pontuação vira espaço: "banana prata" encontra "Banana, prata, crua".
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
}

function bigrams(text: string) {
  const letters = normalize(text).replace(/[^a-z0-9]/g, '');
  return Array.from({ length: Math.max(0, letters.length - 1) }, (_, i) =>
    letters.slice(i, i + 2),
  );
}

/** Semelhança entre 0 e 1 pelos pares de letras em comum (coeficiente de Dice): "banan" ≈ "Banana-prata". */
export function similarity(a: string, b: string) {
  const pairsA = bigrams(a);
  const pairsB = bigrams(b);
  if (pairsA.length === 0 || pairsB.length === 0) return 0;
  const remaining = [...pairsB];
  let common = 0;
  for (const pair of pairsA) {
    const index = remaining.indexOf(pair);
    if (index >= 0) {
      common++;
      remaining.splice(index, 1);
    }
  }
  return (2 * common) / (pairsA.length + pairsB.length);
}
