// "Alimentos que você não come": regras por tipo de alimento (cenoura, batata-doce), não por item do catálogo.
// O tipo sai do começo do nome nas tabelas, sem as palavras de preparo ("Batata, doce, s/ casca, assada" →
// batata doce). Uma regra pega o alimento em qualquer preparo e, se a pessoa quiser, o que tem ele no nome.
import type { AvoidOption, AvoidRule } from '../../contract.js';
import { normalize, PREPARATION, stem, SYNONYMS, words } from './foods.js';

/** Palavras que descrevem o preparo ou a apresentação, não o tipo do alimento (na forma de `stem`). */
const NOT_KIND = new Set([
  ...PREPARATION,
  ...[
    'inteiro',
    'saute',
    'seco',
    'congelado',
    'industrializado',
    'light',
    'diet',
    'natural',
    'comum',
    'fresco',
    'picado',
    'ralado',
    'fatiado',
    'descascado',
    'conserva',
    'enlatado',
    'caseiro',
    'cozimento',
    'pre',
    'polpa',
  ].map(stem),
]);

/** Famílias genéricas que a TBCA põe antes do tipo ("Carne, porco, lombo" é do tipo porco). */
const GENERIC_PREFIX = 'carne';

/** Nomes diferentes do mesmo tipo nas tabelas: o tipo fica com um só ("Carne, boi" e "Carne, bovina" são bovino). */
const CANONICAL: Record<string, string> = {
  boi: 'bovino',
  suino: 'porco',
  aipim: 'mandioco',
  macaxeiro: 'mandioco',
};

/** Quantos exemplos cada opção mostra. */
const EXAMPLES = 3;
/** Quantas opções a busca devolve. */
const MAX_OPTIONS = 10;

const withoutParentheses = (text: string) =>
  text
    .replace(/\([^)]*\)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** As partes do nome separadas pelas vírgulas de fora dos parênteses ("Batata baroa (mandioquinha, batata salsa), cozida"). */
function segments(name: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of name) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts;
}

const kindWord = (word: string) => !NOT_KIND.has(word) && !/\d/.test(word);

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

type KindInfo = {
  /** Palavras do tipo, na forma de `stem` ("batato doce"). */
  words: string[];
  /** O tipo como a pessoa lê ("Batata doce"). */
  label: string;
  /** A família (o tipo sem a variedade) como a pessoa lê ("Batata"; "Carne bovina"). */
  familyLabel: string;
  /** As palavras do nome que formam o tipo, sem acento (para a busca). */
  raw: string[];
  /** Outros nomes do tipo, nos parênteses logo depois dele ("mandioquinha", "batata salsa"). */
  aliases: string[];
};

const cache = new Map<string, KindInfo>();
const MAX_CACHE = 20_000;

/**
 * O tipo do alimento: as palavras do começo do nome (até a 1ª vírgula, sem parênteses nem preparo) e, quando esse
 * começo é uma palavra só, a 2ª parte, se também for uma palavra que não é de preparo ("Batata, doce").
 * "Carne" antes do tipo sai ("Carne, porco, lombo" é porco, como "Porco, lombo").
 */
function kindInfo(name: string): KindInfo {
  const cached = cache.get(name);
  if (cached) return cached;
  const parts = segments(name);
  const first = withoutParentheses(parts[0] ?? '');
  const second = withoutParentheses(parts[1] ?? '');
  let kind = words(first).filter(kindWord);
  let display = first;
  const next = words(second);
  const withSecond =
    kind.length === 1 && next.length === 1 && kindWord(next[0]);
  if (withSecond) {
    kind = [...kind, next[0]];
    display = `${first} ${second}`;
  }
  let familyLabel = capitalize(display.split(' ')[0] ?? '');
  if (kind[0] === GENERIC_PREFIX && kind.length > 1) {
    kind = kind.slice(1);
    familyLabel = capitalize(
      withSecond ? display : display.split(' ').slice(0, 2).join(' '),
    );
    // "Carne, porco, bisteca": a parte depois do tipo é a variedade, como em "Porco, bisteca".
    const third = withoutParentheses(parts[2] ?? '');
    const after = words(third);
    if (withSecond && after.length === 1 && kindWord(after[0])) {
      kind = [...kind, after[0]];
      display = `${display} ${third}`;
    }
  }
  const raw = normalize(display)
    .split(' ')
    .filter(
      (word) => word && (kind.includes(stem(word)) || word === GENERIC_PREFIX),
    );
  // Os parênteses só valem como outro nome do tipo quando são uma lista de nomes curtos (não uma receita), e o
  // tipo é curto ("Batata baroa", não "Papa de ovo e batata baroa").
  const aliases =
    kind.length > 2
      ? []
      : [...(parts[0] ?? '').matchAll(/\(([^)]*)\)/g)]
          .map((match) => match[1].split(','))
          .filter((items) =>
            items.every(
              (item) =>
                item.trim().split(/\s+/).length <= 2 && !/[/\d]/.test(item),
            ),
          )
          .flatMap((items) => normalize(items.join(' ')).split(' '))
          .filter(Boolean);
  const info = {
    words: kind.map((word) => CANONICAL[word] ?? word),
    label: capitalize(display),
    familyLabel,
    raw,
    aliases,
  };
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(name, info);
  return info;
}

/** O tipo do alimento, como fica na regra ("batato doce", na forma de `stem`). */
export function foodKind(name: string) {
  return kindInfo(name).words.join(' ');
}

/** A palavra ou um sinônimo dela é `other`. */
const sameWord = (word: string, other: string | undefined) =>
  other !== undefined &&
  (word === other || (SYNONYMS[word] ?? []).includes(other));

/** O alimento é do tipo `kind` ou de um tipo dentro dele ("batata" pega "batata doce"). */
function isOfKind(name: string, kind: string[]) {
  const own = kindInfo(name).words;
  return (
    kind.length > 0 && kind.every((word, index) => sameWord(word, own[index]))
  );
}

/** O nome tem todas as palavras do tipo ("Bolo de cenoura" tem "cenoura"). */
function mentions(name: string, kind: string[]) {
  const own = words(name);
  return (
    kind.length > 0 &&
    kind.every((word) => own.some((other) => sameWord(word, other)))
  );
}

/** Uma regra pega o alimento: o próprio, em qualquer preparo; com `ingrediente`, também o que o cita no nome. */
function ruleMatches(rule: Pick<AvoidRule, 'kind' | 'scope'>, name: string) {
  const kind = rule.kind.split(' ').filter(Boolean);
  return (
    isOfKind(name, kind) ||
    (rule.scope === 'ingrediente' && mentions(name, kind))
  );
}

/** O que as regras tiram: `true` = a pessoa não come esse alimento. */
export function avoidMatcher(
  rules: AvoidRule[] = [],
): (name: string) => boolean {
  if (rules.length === 0) return () => false;
  return (name) => rules.some((rule) => ruleMatches(rule, name));
}

/** As regras para o prompt: "cenoura (nem pratos ou produtos que levam cenoura); batata doce". */
export function avoidText(rules: AvoidRule[] = []) {
  return rules
    .map((rule) => {
      const label = rule.label.toLowerCase();
      return rule.scope === 'ingrediente'
        ? `${label} (nem pratos ou produtos que levam ${label})`
        : label;
    })
    .join('; ');
}

/**
 * A busca acha o tipo: cada palavra dela está no tipo (pelo começo da palavra, `stem` ou sinônimo) ou nos outros
 * nomes dele, e uma delas é o começo do tipo ("cenoura" acha a cenoura, não o "Bolo de cenoura"). `lead`: achou
 * pelo começo do tipo; `alias`: só por um outro nome ("mandioquinha" → batata baroa).
 */
function queryHits(query: string[], info: KindInfo): 'lead' | 'alias' | null {
  const hits = (token: string, list: string[]) => {
    const accepted = [stem(token), ...(SYNONYMS[stem(token)] ?? [])];
    return list.some(
      (word) => word.startsWith(token) || accepted.includes(stem(word)),
    );
  };
  if (!query.every((token) => hits(token, [...info.raw, ...info.aliases])))
    return null;
  const lead = info.raw.slice(0, info.raw[0] === GENERIC_PREFIX ? 2 : 1);
  if (query.some((token) => hits(token, lead))) return 'lead';
  return query.some((token) => hits(token, info.aliases)) ? 'alias' : null;
}

/** A opção da regra `kind`, com quantos alimentos ela tira só do tipo e também dos que o citam. */
function option(names: string[], kind: string, label: string): AvoidOption {
  const own: string[] = [];
  const dishes: string[] = [];
  for (const name of names)
    if (ruleMatches({ kind, scope: 'alimento' }, name)) own.push(name);
    else if (ruleMatches({ kind, scope: 'ingrediente' }, name))
      dishes.push(name);
  return {
    kind,
    label,
    foods: { count: own.length, examples: own.slice(0, EXAMPLES) },
    ingredient: {
      count: own.length + dishes.length,
      examples: dishes.slice(0, EXAMPLES),
    },
  };
}

/**
 * Busca do "Alimentos que você não come": os tipos do catálogo cujo nome começa pelas palavras de `query`
 * ("batata" → batata inglesa, batata doce, batata baroa…). Se a família tem mais de um tipo, vem antes a opção dela
 * toda ("Batata (todos os tipos)"); depois os tipos com mais alimentos.
 */
export function avoidOptions(names: string[], query: string): AvoidOption[] {
  const tokens = normalize(query)
    .split(' ')
    .filter((token) => token && !/^(de|do|da|com|sem|e)$/.test(token));
  if (tokens.length === 0) return [];
  // Os nomes mais curtos primeiro: os exemplos e os rótulos saem dos alimentos mais simples.
  const sorted = [...names].sort((a, b) => a.length - b.length);
  const kinds = new Map<string, { label: string; count: number }>();
  // A família toda só é opção quando a busca é por ela ("batata"), não por outro nome de um tipo ("mandioquinha").
  const families = new Map<
    string,
    { label: string; kinds: Set<string>; lead: boolean }
  >();
  for (const name of sorted) {
    const info = kindInfo(name);
    const hit = info.words.length > 0 ? queryHits(tokens, info) : null;
    if (!hit) continue;
    const key = info.words.join(' ');
    const entry = kinds.get(key);
    if (entry) entry.count++;
    else kinds.set(key, { label: info.label, count: 1 });
    const family = info.words[0];
    const group = families.get(family) ?? {
      label: info.familyLabel,
      kinds: new Set<string>(),
      lead: false,
    };
    group.kinds.add(key);
    group.lead ||= hit === 'lead';
    families.set(family, group);
  }
  const familyOptions = [...families]
    .filter(
      ([family, group]) =>
        group.lead && (group.kinds.size > 1 || !kinds.has(family)),
    )
    .map(([family, group]) =>
      option(sorted, family, `${group.label} (todos os tipos)`),
    );
  const familyKinds = new Set(familyOptions.map((item) => item.kind));
  const varieties = [...kinds]
    .filter(([kind]) => !familyKinds.has(kind))
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([kind, { label }]) => option(sorted, kind, label));
  return [...familyOptions, ...varieties]
    .filter((item) => item.foods.count > 0)
    .slice(0, MAX_OPTIONS);
}

/**
 * A opção do tipo do alimento `name` (para o "Não gosto" oferecer tirar todos os preparos dele). `null` se o nome
 * não tem tipo ou se o tipo é só esse alimento no catálogo.
 */
export function avoidOptionFor(
  names: string[],
  name: string,
): AvoidOption | null {
  const info = kindInfo(name);
  if (info.words.length === 0) return null;
  const sorted = [...names].sort((a, b) => a.length - b.length);
  const found = option(sorted, info.words.join(' '), info.label);
  return found.foods.count > 1 ? found : null;
}
