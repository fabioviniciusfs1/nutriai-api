import type {
  Diet,
  FoodFeedback,
  FoodGroup,
  Personalization,
  Totals,
} from '../../contract.js';
import type { AnimalTag } from './diet.js';

export type { Totals };

/** Alimento numa porção: gramas e nutrientes já calculados (inteiros). */
export type PlanFood = Totals & { name: string; grams: number };

/** Alimento acrescentado pelo usuário, guardado na porção "fator 1" da refeição. */
export type ExtraFood = PlanFood & { id: string };

export type MealPeriod = 'manha' | 'tarde' | 'noite';

export type CatalogFood = {
  name: string;
  /** `null` = sem grupo (sem substitutos). */
  group: FoodGroup | null;
  per100g: Totals;
  /** Origens animais (para o tipo de alimentação); sem o campo: nenhuma. */
  animal?: AnimalTag[];
};

export type MealSuggestion = {
  title: string;
  periods: MealPeriod[];
  foods: PlanFood[];
};

export type BaseMeal = {
  id: number;
  title: string;
  time: string;
  foods: PlanFood[];
  /** Entra no plano inicial a partir de quantas refeições por dia (padrão 3: sempre). */
  minMealsPerDay?: number;
};

/** Dados fixos que o engine usa: catálogo, sugestões e plano base. */
export type Catalog = {
  foods: CatalogFood[];
  suggestions: MealSuggestion[];
  baseMeals: BaseMeal[];
};

/** Refeição criada pelo usuário: nome e horário dele, alimentos sugeridos pelo sistema. */
export type AddedMeal = {
  id: number;
  title: string;
  time: string;
  /** Título da sugestão de onde vieram os alimentos. */
  suggestion: string;
  foods: PlanFood[];
};

/**
 * Mudanças permanentes no plano (até o usuário desfazer). Criar refeição e acrescentar alimento tiram
 * as calorias das outras refeições (reduzindo as porções), para o total do dia não aumentar.
 */
export type PlanChanges = {
  /** Refeições do plano base removidas com "não fazer nada". */
  removed: number[];
  added: AddedMeal[];
  /** Alimentos acrescentados a cada refeição (id → alimentos), na porção "fator 1". */
  extraFoods: Record<number, ExtraFood[]>;
  /** Fator permanente das porções de cada refeição (id → fator). */
  scales: Record<number, number>;
};

/** Mudanças que valem só no dia em que foram feitas ("sugerir uma nova" e "redistribuir"). */
export type DayPlanChanges = {
  /** Removidas hoje com "redistribuir". */
  removed: number[];
  /** Trocadas hoje por outra sugestão. */
  replacements: Record<number, { title: string; foods: PlanFood[] }>;
  /** Fator das porções só de hoje (id → fator), multiplicado pelo permanente. */
  scales: Record<number, number>;
};

export const EMPTY_PLAN_CHANGES: PlanChanges = {
  removed: [],
  added: [],
  extraFoods: {},
  scales: {},
};

export const EMPTY_DAY_PLAN: DayPlanChanges = {
  removed: [],
  replacements: {},
  scales: {},
};

/** Tudo o que o usuário mudou, já com `dayPlan` de hoje (vazio se era de outro dia). */
export type PlanState = {
  mealTimes: Record<number, string>;
  planChanges: PlanChanges;
  dayPlan: DayPlanChanges;
  foodFeedback: Record<string, FoodFeedback>;
  foodSubstitutes: Record<string, string>;
  mealFoodSwaps: Record<number, Record<string, string>>;
  nextExtraId: number;
  /** Refeições do plano base montadas pelo assistente para o usuário; sem o campo, as do plano base. */
  personalMeals?: PersonalMeals | null;
};

/** Versão individual das refeições do plano base (id → título e alimentos, nas porções do assistente). */
export type PersonalMeals = Record<
  number,
  { title: string; foods: PlanFood[] }
>;

/** O que o plano usa do perfil do usuário. */
export type PlannerOptions = {
  /** Meta calórica do dia; `null` (sem perfil) = porções originais do plano base. */
  calorieGoal: number | null;
  /** Refeições do plano inicial (3 a 6). */
  mealsPerDay: number;
  /** Tipo de alimentação do perfil: sugestões e substitutos fora dela ficam de fora (padrão: onívora). */
  diet?: Diet;
  /** Estado da montagem do plano individual, devolvido em `todayPlan()` (padrão: `null`). */
  personalization?: Personalization;
  /** O assistente pode compor refeições novas (então sempre dá para criar uma). */
  composerAvailable?: boolean;
};

export const DEFAULT_PLANNER_OPTIONS: PlannerOptions = {
  calorieGoal: null,
  mealsPerDay: 3,
};
