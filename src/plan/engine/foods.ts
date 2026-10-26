// Porções, trocas e busca de alimentos (porte de `reference/food-substitution.ts` e `AddFoodDialog.tsx`).
// - "Não gosto", "Não tenho" e "Não posso": troca permanente em todas as refeições.
// - "Não quero": troca permanente só na refeição marcada.
// O substituto entra com as mesmas calorias. Liberar o alimento não desfaz trocas já feitas.
import type { FoodFeedback } from '../../contract.js';
import type { CatalogFood, PlanFood, Totals } from './types.js';

/** Evita laço se as trocas formarem um ciclo (A → B → A). */
const MAX_CHAIN = 5;

/** Nos substitutos sem o assistente, quantos da mesma família (ex.: "Batata, …") antes de variar. */
const MAX_PER_FAMILY = 2;

/** Peso da diferença de calorias por 100 g (em log) no ranking dos substitutos sem o assistente. */
const DENSITY_WEIGHT = 0.3;

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

/** Peso de uma unidade de ovo sem ajuste da dieta (g). */
export const DEFAULT_EGG_UNIT_GRAMS = 55;

/**
 * Ovo de galinha inteiro, que vai no plano em unidades ("Ovo, de galinha, inteiro, cozido", "Ovo poché"): não
 * conta ovo de codorna ou de pata, clara, gema, ovo em pó nem mexido (que leva gordura).
 */
export function isEggUnit(name: string) {
  const text = normalize(name);
  return (
    /^ovos?\b/.test(text) &&
    !/\b(codorna|pata|clara|gema|desidratad[ao]|mexido|po)\b/.test(text)
  );
}

/**
 * Porção do alimento multiplicada por `factor`; ovo inteiro em unidades de `eggUnitGrams` (pelo menos uma), com
 * os nutrientes na proporção das gramas e `units` preenchido.
 */
export function portionFood<T extends PlanFood>(
  food: T,
  factor: number,
  eggUnitGrams: number,
): T {
  if (!isEggUnit(food.name) || food.grams <= 0)
    return scaleFoods([food], factor)[0];
  const units = Math.max(1, Math.round((food.grams * factor) / eggUnitGrams));
  const grams = units * eggUnitGrams;
  return { ...scaleFoods([food], grams / food.grams)[0], grams, units };
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

/** Começo do nome nas tabelas, que indica a família do alimento ("Arroz, tipo 1, cozido" → "arroz"). */
function foodFamily(name: string) {
  return normalize(name.split(',')[0]);
}

/** No empate, `a` vem antes de `b`: primeiro a TACO (nomes mais simples), depois o nome mais curto. */
function preferred(a: CatalogFood, b: CatalogFood) {
  const taco = (food: CatalogFood) => (food.source === 'tbca' ? 1 : 0);
  return (
    (taco(a) - taco(b) ||
      a.name.length - b.name.length ||
      (a.name < b.name ? -1 : 1)) < 0
  );
}

/** Alimento cru pelo nome ("…, cru", "…, crua"). */
export function isRaw(name: string) {
  return /\bcrus?\b|\bcruas?\b/.test(normalize(name));
}

/** Palavras que não ajudam a achar o alimento ("Arroz c/ feijão" ≈ "Arroz feijão"). */
const STOPWORDS = new Set([
  'a',
  'o',
  'e',
  'c',
  's',
  'p',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'com',
  'sem',
  'em',
  'na',
  'no',
  'ao',
  'tipo',
]);

/** Famílias genéricas das tabelas ("Peixe, água doce, tilápia, …"): não precisam estar no nome citado. */
const GENERIC_FAMILIES = new Set(['peixe', 'carne', 'queijo', 'bebido']);

/** Outras palavras com que as tabelas chamam a mesma coisa (já na forma de `stem`). */
const SYNONYMS: Record<string, string[]> = {
  branco: ['polido', '1'],
  bovino: ['boi'],
  boi: ['bovino'],
  suino: ['porco'],
  porco: ['suino'],
  aipim: ['mandioco'],
  macaxeiro: ['mandioco'],
  mandioco: ['aipim', 'macaxeiro'],
  file: ['peito'],
  // "Castanha-do-pará" é a castanha-do-brasil; o tofu é o "Soja, queijo (tofu)" da TACO.
  paro: ['brasil'],
  tofu: ['sojo', 'queijo'],
};

/** Forma comparável de uma palavra: sem plural e no masculino ("cozidas" → "cozido", "crua" → "cru"). */
function stem(word: string) {
  if (/^crus?$|^cruas?$/.test(word)) return 'cru';
  let result = word.length > 3 ? word.replace(/s$/, '') : word;
  if (result.length > 3 && result.endsWith('a'))
    result = `${result.slice(0, -1)}o`;
  return result;
}

/** Palavras do nome que identificam o alimento. */
function words(text: string) {
  return normalize(text)
    .split(' ')
    .filter((word) => word && !STOPWORDS.has(word))
    .map(stem);
}

/** Palavras de preparo e de apresentação: não mudam qual é o alimento ("Batata, doce, s/ casca, assada"). */
const PREPARATION = new Set(
  [
    'cozido',
    'assado',
    'grelhado',
    'frito',
    'cru',
    'refogado',
    'drenado',
    'ensopado',
    'empanado',
    'vapor',
    'casca',
    'pele',
    'sal',
    'oleo',
    'natura',
    'temperado',
    'tempero',
  ].map(stem),
);

/**
 * `candidate` é o mesmo alimento que `original`, em outro preparo: tem todas as palavras que identificam o
 * original (sem as de preparo), aceitando os sinônimos. "Batata, doce, s/ casca, assada" é o mesmo que
 * "Batata, doce, cozida"; "Batata, inglesa, cozida" não é.
 */
export function isSameFood(original: string, candidate: string) {
  // Tempo de preparo ("cozido/10minutos") também é preparo; número sozinho ("tipo 1") identifica.
  const key = words(original).filter(
    (word) => !PREPARATION.has(word) && !/\d[a-z]|[a-z]\d/.test(word),
  );
  if (key.length === 0) return false;
  const candidateWords = new Set(words(candidate));
  return key.every((word) =>
    [word, ...(SYNONYMS[word] ?? [])].some((item) => candidateWords.has(item)),
  );
}

/** Valores aproximados por 100 g que o assistente informa junto com o nome, para desempatar. */
export type ApproxPer100g = Partial<Totals>;

/** Diferença relativa de calorias acima da qual o alimento do catálogo não é o citado (cru × cozido). */
const MAX_KCAL_GAP = 0.6;
const KCAL_GAP_FLOOR = 50;
/** Fração mínima das palavras citadas (pesadas pela raridade) que o nome do catálogo precisa ter. */
const MIN_RECALL = 0.5;
/** Grupos em que o cru só vale se o nome citado diz cru. */
const RAW_PENALTY_GROUPS = new Set<CatalogFood['group']>([
  'proteinas',
  'carboidratos',
  null,
]);

export class FoodCatalog {
  private readonly byName: Map<string, CatalogFood>;
  private byNormalizedName: Map<string, string> | null = null;
  private index: {
    /** Palavras de cada alimento (na ordem de `foods`) e as da família (antes da 1ª vírgula). */
    words: Set<string>[];
    family: string[][];
    /** Palavras do nome sem as stopwords, como estão e na forma de `stem` (para a busca). */
    tokens: { raw: string; stem: string }[][];
    /** Palavra → posições dos alimentos que a têm. */
    postings: Map<string, number[]>;
  } | null = null;

  constructor(readonly foods: CatalogFood[]) {
    this.byName = new Map(foods.map((food) => [food.name, food]));
  }

  entry(name: string) {
    return this.byName.get(name);
  }

  private wordIndex() {
    if (this.index) return this.index;
    const postings = new Map<string, number[]>();
    const all = this.foods.map((food, position) => {
      const set = new Set(words(food.name));
      for (const word of set) {
        const list = postings.get(word);
        if (list) list.push(position);
        else postings.set(word, [position]);
      }
      return set;
    });
    this.index = {
      words: all,
      family: this.foods.map((food) => words(food.name.split(',')[0])),
      tokens: this.foods.map((food) =>
        normalize(food.name)
          .split(' ')
          .filter((word) => word && !STOPWORDS.has(word))
          .map((raw) => ({ raw, stem: stem(raw) })),
      ),
      postings,
    };
    return this.index;
  }

  /**
   * O nome do catálogo do alimento citado pelo assistente (que não vê o catálogo), ou `null` se nenhum
   * servir. Nome igual (sem diferenciar acentos e maiúsculas) vale direto. Senão, pontua pelas palavras
   * citadas que o nome tem e pelas que sobram nele (prefere o simples à receita), exige a família do
   * alimento entre as palavras citadas ("Banana, prata" não serve para "Bolo de banana") e, com `approx`,
   * descarta calorias muito diferentes e prefere as mais próximas. Desempate: TACO, depois o nome mais curto.
   */
  match(name: string, approx?: ApproxPer100g): string | null {
    if (this.byName.has(name)) return name;
    this.byNormalizedName ??= new Map(
      [...this.foods]
        .reverse()
        .map((food) => [normalize(food.name), food.name]),
    );
    const same = this.byNormalizedName.get(normalize(name));
    if (same) return same;

    const query = [...new Set(words(name))];
    if (query.length === 0) return null;
    const accepts = (word: string) => [word, ...(SYNONYMS[word] ?? [])];
    const queryWords = new Set(query.flatMap(accepts));
    const index = this.wordIndex();

    // Cada palavra citada pesa pela raridade no catálogo ("tilápia" pesa mais que "peixe"); uma que o
    // catálogo não tem ("light", "simples") pesa o mínimo, para não barrar o alimento.
    const hits = new Map<number, number>();
    let total = 0;
    for (const word of query) {
      const positions = new Set(
        accepts(word).flatMap((item) => index.postings.get(item) ?? []),
      );
      const rarity = Math.log(
        1 + this.foods.length / (positions.size || this.foods.length),
      );
      total += rarity;
      for (const position of positions)
        hits.set(position, (hits.get(position) ?? 0) + rarity);
    }

    const raw = isRaw(name);
    let best: { food: CatalogFood; score: number } | null = null;
    for (const [position, matched] of hits) {
      const recall = matched / total;
      if (recall < MIN_RECALL) continue;
      const family = index.family[position];
      if (
        !family.every(
          (word) => queryWords.has(word) || GENERIC_FAMILIES.has(word),
        )
      )
        continue;
      const food = this.foods[position];
      const foodWords = index.words[position];
      const precision =
        [...foodWords].filter((word) => queryWords.has(word)).length /
        foodWords.size;
      let score = recall * 2 + precision;
      // Carnes, ovos, grãos e massas cruas só se o nome citado diz cru (frutas e castanhas são comidas cruas).
      if (!raw && isRaw(food.name) && RAW_PENALTY_GROUPS.has(food.group))
        score -= 0.5;
      if (approx?.kcal !== undefined && approx.kcal > 0) {
        // Com piso: entre alimentos quase sem calorias (café, folhas), 9 × 2 kcal não é diferença.
        const gap =
          Math.abs(food.per100g.kcal - approx.kcal) /
          Math.max(food.per100g.kcal, approx.kcal, KCAL_GAP_FLOOR);
        if (gap > MAX_KCAL_GAP) continue;
        score -= gap * 1.5;
        const { protein, fat, carbs } = approx;
        if (protein !== undefined && fat !== undefined && carbs !== undefined) {
          const shares = macroShares({
            name,
            group: null,
            per100g: { kcal: approx.kcal, protein, fat, carbs },
          });
          score -=
            (macroShares(food).reduce(
              (sum, share, i) => sum + Math.abs(share - shares[i]),
              0,
            ) /
              2) *
            0.5;
        }
      }
      if (
        !best ||
        score > best.score + 1e-9 ||
        (Math.abs(score - best.score) <= 1e-9 && preferred(food, best.food))
      )
        best = { food, score };
    }
    return best?.food.name ?? null;
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
   * Substitutos do mesmo grupo, sem o próprio alimento (nem ele em outro preparo, `isSameFood`) e sem os
   * restritos, com as mesmas calorias (usado sem o assistente): os `limit` mais parecidos — primeiro os da
   * mesma família (mesmo começo do nome, ex. "Arroz, …"), depois evitando os crus se o original não for cru, e
   * pela proporção de macronutrientes e pelas calorias por 100 g (farinha não substitui batata cozida). No máximo
   * `MAX_PER_FAMILY` de cada família e nunca duas versões do mesmo alimento (com e sem sal), para a lista
   * variar; só se faltar opção vêm mais da mesma família.
   */
  substituteOptions(
    foodName: string,
    kcal: number,
    feedback: Record<string, FoodFeedback>,
    limit: number,
    allowed: (name: string) => boolean = () => true,
  ): PlanFood[] {
    const original = this.entry(foodName);
    if (!original?.group) return [];
    const distance = macroDistance(original);
    const family = foodFamily(foodName);
    const originalRaw = isRaw(foodName);
    const rank = (food: CatalogFood) => [
      foodFamily(food.name) === family ? 0 : 1,
      !originalRaw && isRaw(food.name) ? 1 : 0,
      // Receitas com a lista de ingredientes (TBCA) depois dos alimentos simples.
      food.name.includes('(') ? 1 : 0,
      distance(food) +
        Math.abs(Math.log(food.per100g.kcal / original.per100g.kcal)) *
          DENSITY_WEIGHT,
    ];
    const ranked = this.foods
      .filter(
        (food) =>
          food.group === original.group &&
          food.name !== foodName &&
          !isSameFood(foodName, food.name) &&
          !feedback[food.name] &&
          food.per100g.kcal > 0 &&
          allowed(food.name),
      )
      .map((food) => ({ food, rank: rank(food) }))
      .sort(
        (a, b) =>
          a.rank[0] - b.rank[0] ||
          a.rank[1] - b.rank[1] ||
          a.rank[2] - b.rank[2] ||
          a.rank[3] - b.rank[3],
      );
    const chosen: CatalogFood[] = [];
    const pick = (familyCap: number) => {
      for (const { food } of ranked) {
        if (chosen.length === limit) return;
        if (chosen.includes(food)) continue;
        const family = foodFamily(food.name);
        if (
          chosen.filter((item) => foodFamily(item.name) === family).length >=
          familyCap
        )
          continue;
        // Duas versões do mesmo alimento (com e sem sal, com o nome científico ou sem): da mesma família e uma
        // com tudo o que identifica a outra. A família evita que "Mandioca, cozida" barre "Farinha, de mandioca".
        if (
          chosen.some(
            (item) =>
              foodFamily(item.name) === family &&
              (isSameFood(item.name, food.name) ||
                isSameFood(food.name, item.name)),
          )
        )
          continue;
        chosen.push(food);
      }
    };
    pick(MAX_PER_FAMILY);
    pick(Infinity);
    return chosen.flatMap((food) => this.convert(food.name, kcal) ?? []);
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
   * Busca do "Adicionar alimento": nomes que têm todas as palavras do texto, em qualquer ordem (sem diferenciar
   * maiúsculas nem acentos). Cada palavra vale pelo começo de uma palavra do nome ("guaca" → "Guacamole"), sem
   * plural nem gênero ("ovos" → "Ovo") ou por um sinônimo ("aipim" → "Mandioca"); "de", "com" etc. não contam.
   * Se nenhum, os mais parecidos. Restritos nunca aparecem; `restricted` diz se o texto é um deles.
   */
  search(query: string, feedback: Record<string, FoodFeedback>) {
    const normalized = normalize(query);
    const allowed = this.foods.filter((food) => !feedback[food.name]);
    const all = normalized.split(' ').filter(Boolean);
    const meaningful = all.filter((token) => !STOPWORDS.has(token));
    const tokens = meaningful.length > 0 ? meaningful : all;
    const index = this.wordIndex();
    const accepted = tokens.map((token) => [
      stem(token),
      ...(SYNONYMS[stem(token)] ?? []),
    ]);
    const hits = (token: number, word: { raw: string; stem: string }) =>
      word.raw.startsWith(tokens[token]) || accepted[token].includes(word.stem);
    const hitsAny = (word: { raw: string; stem: string }) =>
      tokens.some((_, token) => hits(token, word));
    // Primeiro os que começam por uma palavra do texto ("Frango, …" antes de "Linguiça, frango"), depois os
    // com menos palavras além das do texto (não as receitas longas), depois os da TACO e os nomes mais curtos.
    const matches = this.foods
      .map((food, position) => ({ food, words: index.tokens[position] }))
      .filter(
        ({ food, words }) =>
          tokens.length > 0 &&
          !feedback[food.name] &&
          tokens.every((_, token) => words.some((word) => hits(token, word))),
      )
      .map(({ food, words }) => ({
        food,
        lead: words.length > 0 && hitsAny(words[0]),
        extra: words.filter((word) => !hitsAny(word)).length,
      }))
      .sort(
        (a, b) =>
          Number(!a.lead) - Number(!b.lead) ||
          a.extra - b.extra ||
          (preferred(a.food, b.food) ? -1 : 1),
      )
      .map(({ food }) => food);
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
