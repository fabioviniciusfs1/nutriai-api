import type {
  Diet,
  FoodFeedback,
  FoodGroup,
  MealSlot,
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
  /** Tabela de origem (`taco`, `tbca`); no empate, a TACO vem antes. */
  source?: string;
};

export type BaseMeal = {
  id: number;
  title: string;
  time: string;
  foods: PlanFood[];
  /** Qual refeição do dia ela é: entra no plano inicial de quem faz essa refeição. */
  slot: MealSlot;
};

/** Dados fixos que o engine usa: catálogo e plano base. */
export type Catalog = {
  foods: CatalogFood[];
  baseMeals: BaseMeal[];
};

/**
 * Mudanças permanentes no plano (até o usuário desfazer). Acrescentar alimento tira
 * as calorias das outras refeições (reduzindo as porções), para o total do dia não aumentar.
 */
export type PlanChanges = {
  /** Alimentos acrescentados a cada refeição (id → alimentos), na porção "fator 1". */
  extraFoods: Record<number, ExtraFood[]>;
  /** Fator permanente das porções de cada refeição (id → fator). */
  scales: Record<number, number>;
};

export const EMPTY_PLAN_CHANGES: PlanChanges = {
  extraFoods: {},
  scales: {},
};

/** Tudo o que o usuário mudou no plano. */
export type PlanState = {
  mealTimes: Record<number, string>;
  planChanges: PlanChanges;
  foodFeedback: Record<string, FoodFeedback>;
  foodSubstitutes: Record<string, string>;
  mealFoodSwaps: Record<number, Record<string, string>>;
  nextExtraId: number;
  /** Refeições do plano base montadas pelo assistente para o usuário; sem o campo, as do plano base. */
  personalMeals?: PersonalMeals | null;
};

/**
 * Versão individual das refeições do plano base (id → título, alimentos nas porções do assistente e o horário
 * que ele escolheu pela rotina; sem `time`, o do plano base).
 */
export type PersonalMeals = Record<
  number,
  { title: string; foods: PlanFood[]; time?: string }
>;

/** O que o plano usa do perfil do usuário. */
export type PlannerOptions = {
  /** Meta calórica do dia; `null` (sem perfil) = porções originais do plano base. */
  calorieGoal: number | null;
  /** Refeições do plano inicial: as que o usuário marcou na rotina. */
  meals: MealSlot[];
  /** Tipo de alimentação do perfil: substitutos fora dela ficam de fora (padrão: onívora). */
  diet?: Diet;
  /** Estado da montagem do plano individual, devolvido em `todayPlan()` (padrão: `null`). */
  personalization?: Personalization;
};

export const DEFAULT_PLANNER_OPTIONS: PlannerOptions = {
  calorieGoal: null,
  meals: ['cafe-da-manha', 'almoco', 'jantar'],
};
