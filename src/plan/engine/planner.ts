// Regras do plano do dia (porte de `reference/MealPlan.tsx` e das funções de `reference/auth.ts`).
// Tudo puro: recebe o estado do usuário e devolve o novo estado ou uma prévia, sem I/O.
import type {
  FoodFeedback,
  FoodSearchResult,
  PlanMeal,
  RestrictedFood,
  TodayPlan,
  Totals,
} from '../../contract.js';
import { FoodCatalog, scaleFoods, sumTotals } from './foods.js';
import type {
  Catalog,
  MealPeriod,
  PlanChanges,
  PlanFood,
  PlannerOptions,
  PlanState,
} from './types.js';
import { DEFAULT_PLANNER_OPTIONS } from './types.js';
import { allowedByDiet } from './diet.js';

/** Refeição do plano montado, com o que é preciso para recalcular a porção dela. */
export type BuiltMeal = PlanMeal & {
  /** Totais se a porção desta refeição passar a ser `scale` (usado nas prévias). */
  totalsAt: (scale: number) => Totals;
};

/** Período do dia de um horário "HH:MM": manhã até 10:59, tarde até 16:59, noite depois. */
export function mealPeriod(time: string): MealPeriod {
  if (time < '11:00') return 'manha';
  if (time < '17:00') return 'tarde';
  return 'noite';
}

/**
 * Multiplica as porções de `meals` por `factor` e, se os valores arredondados passarem de
 * `limitKcal`, aperta o fator (×0,999) até caber. O dia nunca ganha calorias com uma ação do usuário.
 */
export function fitFactor(
  meals: BuiltMeal[],
  scales: Record<number, number>,
  factor: number,
  limitKcal: number,
) {
  const kcalAt = (f: number) =>
    meals.reduce(
      (sum, meal) => sum + meal.totalsAt((scales[meal.id] ?? 1) * f).kcal,
      0,
    );
  let fitted = factor;
  for (let i = 0; i < 200 && kcalAt(fitted) > limitKcal; i++) fitted *= 0.999;
  return fitted;
}

/** Erro de regra do plano; o serviço traduz para o status HTTP. */
export class PlanRuleError extends Error {
  constructor(
    readonly kind: 'not-found' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Fator que leva as refeições `meals` (porções originais) para perto de `goal` kcal: a proporção
 * direta, ajustada em passos de 0,1% (até ±5%) para o total já arredondado ficar o mais perto da meta.
 */
export function goalFactor(meals: PlanFood[][], goal: number | null): number {
  const kcalAt = (factor: number) =>
    meals.reduce(
      (sum, foods) => sum + sumTotals(scaleFoods(foods, factor)).kcal,
      0,
    );
  const baseKcal = kcalAt(1);
  if (!goal || baseKcal === 0) return 1;
  const direct = goal / baseKcal;
  let best = { factor: direct, distance: Math.abs(kcalAt(direct) - goal) };
  for (let step = 1; step <= 50 && best.distance > 0; step++) {
    for (const factor of [
      direct * (1 - step / 1000),
      direct * (1 + step / 1000),
    ]) {
      const distance = Math.abs(kcalAt(factor) - goal);
      if (distance < best.distance) best = { factor, distance };
    }
  }
  return best.factor;
}

export const MEAL_NOT_FOUND = 'Refeição não encontrada.';
/** Quantos substitutos oferecer ao trocar um alimento. */
export const MAX_SUBSTITUTES = 8;
/** Quantos alimentos a pesquisa do diálogo de troca devolve. */
export const MAX_SEARCH_SUBSTITUTES = 20;
export const FOOD_NOT_FOUND = 'Alimento não encontrado.';

export class Planner {
  private readonly foods: FoodCatalog;
  /** O que o usuário vê hoje. */
  readonly plan: BuiltMeal[];
  /**
   * Refeições do plano base que entram no plano inicial, pelas refeições da rotina (com a versão
   * individual do assistente, quando houver).
   */
  private readonly baseMeals: Catalog['baseMeals'];
  /**
   * Multiplica todas as porções para o plano inicial (sem mudanças do usuário) ficar perto da meta
   * calórica. As ações do usuário mudam os fatores de porção por cima dele.
   */
  readonly goalFactor: number;

  constructor(
    private readonly catalog: Catalog,
    readonly state: PlanState,
    private readonly options: PlannerOptions = DEFAULT_PLANNER_OPTIONS,
  ) {
    this.foods = new FoodCatalog(catalog.foods);
    // As refeições que o assistente montou para o usuário trocam título e alimentos da refeição base.
    const personal = state.personalMeals ?? {};
    this.baseMeals = catalog.baseMeals
      .filter((meal) => options.meals.includes(meal.slot))
      .map((meal) =>
        personal[meal.id] ? { ...meal, ...personal[meal.id] } : meal,
      );
    this.goalFactor = goalFactor(
      this.baseMeals.map((meal) => meal.foods),
      options.calorieGoal,
    );
    this.plan = this.buildPlan(state.planChanges);
  }

  /** Plano com as mudanças `changes`, nos horários do usuário. */
  private buildPlan(changes: PlanChanges): BuiltMeal[] {
    const { mealTimes, foodSubstitutes, mealFoodSwaps } = this.state;
    return this.baseMeals
      .map((meal) => {
        const scale = changes.scales[meal.id] ?? 1;
        // As trocas da refeição ("Não quero") valem por cima das gerais ("Não gosto"/"Não tenho"/"Não posso").
        const swaps = { ...foodSubstitutes, ...mealFoodSwaps[meal.id] };
        const planFoods = this.foods
          .resolve(meal.foods, swaps)
          .map((food) => ({
            ...food,
            extraId: null as string | null,
            fixed: false,
          }));
        const extras = (changes.extraFoods[meal.id] ?? []).flatMap((extra) =>
          this.foods.resolve([extra], swaps).map((resolved) => ({
            ...plain(resolved),
            extraId: extra.id,
            fixed: extra.fixed === true,
          })),
        );
        const baseFoods = [...planFoods, ...extras];
        // Porções ajustadas pelos fatores; os extras nas gramas do usuário (`fixed`) ficam como estão.
        const scaled = (factor: number) =>
          baseFoods.map(({ fixed, ...food }) =>
            fixed ? food : scaleFoods([food], factor)[0],
          );
        const foods = scaled(this.goalFactor * scale);
        return {
          id: meal.id,
          title: meal.title,
          time: mealTimes[meal.id] ?? meal.time,
          totals: sumTotals(foods),
          foods,
          totalsAt: (nextScale: number) =>
            sumTotals(scaled(this.goalFactor * nextScale)),
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  todayPlan(): TodayPlan {
    return {
      meals: this.plan.map(({ id, title, time, totals, foods }) => ({
        id,
        title,
        time,
        totals,
        foods,
      })),
      personalization: this.options.personalization ?? null,
    };
  }

  /** Refeição do plano de hoje; erro `not-found` se não existir. */
  meal(id: number): BuiltMeal {
    const meal = this.plan.find((item) => item.id === id);
    if (!meal) throw new PlanRuleError('not-found', MEAL_NOT_FOUND);
    return meal;
  }

  private withState(changes: Partial<PlanState>): PlanState {
    return { ...this.state, ...changes };
  }

  private withPlanChanges(changes: Partial<PlanChanges>): PlanState {
    return this.withState({
      planChanges: { ...this.state.planChanges, ...changes },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Tipo de alimentação

  /** O alimento cabe no tipo de alimentação do perfil (alimento fora do catálogo: cabe). */
  private allowed = (name: string) => {
    const entry = this.foods.entry(name);
    return !entry || allowedByDiet(entry, this.options.diet ?? 'onivora');
  };

  // ---------------------------------------------------------------------------------------------
  // Porções

  /** Total de calorias do plano de hoje. */
  dayKcal() {
    return sumTotals(this.plan.map((meal) => meal.totals)).kcal;
  }

  // ---------------------------------------------------------------------------------------------
  // Acrescentar e remover alimento

  /** Porção sugerida de `foodName` na refeição (valor inicial das gramas): a média dos alimentos dela em kcal. */
  private suggestedPortion(mealId: number, foodName: string) {
    const meal = this.meal(mealId);
    const portionKcal =
      Math.round(meal.totals.kcal / (meal.foods.length + 1)) || 100;
    return this.foods.convert(foodName, portionKcal);
  }

  searchFoods(mealId: number, query: string): FoodSearchResult {
    this.meal(mealId);
    const { found, restricted, candidates } = this.foods.search(
      query,
      this.state.foodFeedback,
    );
    return {
      found,
      restricted,
      options: candidates.flatMap((food) => {
        const suggested = this.suggestedPortion(mealId, food.name);
        return suggested ? [{ food: suggested }] : [];
      }),
    };
  }

  /** `grams` gramas de `foodName` (prévia do alimento extra); erro se restrito ou fora do catálogo. */
  foodPortion(mealId: number, foodName: string, grams: number): PlanFood {
    this.meal(mealId);
    if (this.state.foodFeedback[foodName]) {
      throw new PlanRuleError(
        'invalid',
        'Esse alimento está restrito. Libere-o na página Alimentos para usá-lo.',
      );
    }
    const food = this.foods.portion(foodName, grams);
    if (!food) throw new PlanRuleError('not-found', FOOD_NOT_FOUND);
    return food;
  }

  /**
   * Acrescenta `grams` gramas de `foodName` à refeição, como alimento extra: as gramas ficam fixas (fora dos
   * fatores de porção) e as calorias somam às do dia; as outras refeições não mudam.
   */
  addFood(mealId: number, foodName: string, grams: number): PlanState {
    const food = this.foodPortion(mealId, foodName, grams);
    const { extraFoods } = this.state.planChanges;
    const extra = {
      ...food,
      id: `x-${this.state.nextExtraId}`,
      fixed: true as const,
    };
    return {
      ...this.withPlanChanges({
        extraFoods: {
          ...extraFoods,
          [mealId]: [...(extraFoods[mealId] ?? []), extra],
        },
      }),
      nextExtraId: this.state.nextExtraId + 1,
    };
  }

  /**
   * Tira um alimento acrescentado. O extra nas gramas do usuário só sai (as outras refeições não mudam); nos
   * extras antigos, as calorias dele voltam para as refeições do dia.
   */
  removeExtraFood(mealId: number, extraId: string): PlanState {
    this.meal(mealId);
    const { planChanges } = this.state;
    const current = planChanges.extraFoods[mealId] ?? [];
    const removed = current.find((food) => food.id === extraId);
    if (!removed) throw new PlanRuleError('not-found', FOOD_NOT_FOUND);

    const extraFoods = {
      ...planChanges.extraFoods,
      [mealId]: current.filter((food) => food.id !== extraId),
    };
    if (removed.fixed) return this.withPlanChanges({ extraFoods });

    const dayKcal = sumTotals(this.plan.map((meal) => meal.totals)).kcal;
    const nextPlan = this.buildPlan({ ...planChanges, extraFoods });
    const currentKcal = sumTotals(nextPlan.map((meal) => meal.totals)).kcal;
    const factor =
      currentKcal === 0
        ? 1
        : fitFactor(
            nextPlan,
            planChanges.scales,
            dayKcal / currentKcal,
            dayKcal,
          );
    const scales = { ...planChanges.scales };
    for (const meal of nextPlan)
      scales[meal.id] = (planChanges.scales[meal.id] ?? 1) * factor;
    return this.withPlanChanges({ extraFoods, scales });
  }

  // ---------------------------------------------------------------------------------------------
  // Horário

  changeMealTime(id: number, time: string): PlanState {
    this.meal(id);
    return this.withState({
      mealTimes: { ...this.state.mealTimes, [id]: time },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Trocar alimento e restrições

  /** Alimento como aparece na refeição de hoje. */
  private mealFood(mealId: number, foodName: string) {
    const food = this.meal(mealId).foods.find((item) => item.name === foodName);
    if (!food) throw new PlanRuleError('not-found', FOOD_NOT_FOUND);
    return food;
  }

  /**
   * Substitutos do alimento, com as mesmas calorias que ele tem na refeição, sem o próprio e sem os restritos.
   * `names` (sugeridos pelo assistente, na ordem dele): só os que existem no catálogo. Sem `names`: os do
   * mesmo grupo mais parecidos em macronutrientes. No máximo `MAX_SUBSTITUTES`, sem os de `exclude` (os já
   * mostrados, no "Ver mais").
   */
  substitutes(
    mealId: number,
    foodName: string,
    names?: string[],
    exclude: string[] = [],
  ): PlanFood[] {
    const food = this.mealFood(mealId, foodName);
    const feedback = this.state.foodFeedback;
    const excluded = new Set(exclude);
    const offered = (name: string) => this.allowed(name) && !excluded.has(name);
    if (!names)
      return this.foods.substituteOptions(
        foodName,
        food.kcal,
        feedback,
        MAX_SUBSTITUTES,
        offered,
      );
    return [...new Set(names)]
      .filter(offered)
      .flatMap(
        (name) =>
          this.foods.substitute(name, foodName, food.kcal, feedback) ?? [],
      )
      .slice(0, MAX_SUBSTITUTES);
  }

  /**
   * Pesquisa do diálogo de troca, para quem já sabe o que quer comer: alimentos cujo nome contém `query` (ou
   * os mais parecidos, se nenhum), com as mesmas calorias que o alimento tem na refeição, sem o próprio, sem
   * restritos e sem os de fora do tipo de alimentação. No máximo `MAX_SEARCH_SUBSTITUTES`.
   */
  searchSubstitutes(
    mealId: number,
    foodName: string,
    query: string,
  ): PlanFood[] {
    const food = this.mealFood(mealId, foodName);
    const feedback = this.state.foodFeedback;
    return this.foods
      .search(query, feedback)
      .candidates.filter((candidate) => this.allowed(candidate.name))
      .flatMap(
        (candidate) =>
          this.foods.substitute(
            candidate.name,
            foodName,
            food.kcal,
            feedback,
          ) ?? [],
      )
      .slice(0, MAX_SEARCH_SUBSTITUTES);
  }

  /**
   * "Não gosto" / "Não tenho" / "Não posso": troca permanente em todas as refeições e o alimento fica restrito.
   * "Não quero": troca permanente só nesta refeição; fica restrito só se ainda não tiver marcação.
   * `substitute` `null` = sai sem substituto.
   */
  swapFood(
    mealId: number,
    foodName: string,
    reason: FoodFeedback,
    substitute: string | null,
  ): PlanState {
    const food = this.mealFood(mealId, foodName);
    // Qualquer alimento do catálogo serve (o assistente sugere de qualquer grupo), menos o próprio e os restritos.
    if (substitute !== null) {
      const valid =
        this.allowed(substitute) &&
        this.foods.substitute(
          substitute,
          foodName,
          food.kcal,
          this.state.foodFeedback,
        );
      if (!valid)
        throw new PlanRuleError(
          'invalid',
          'Esse substituto não está disponível para este alimento.',
        );
    }
    const { foodFeedback, foodSubstitutes, mealFoodSwaps } = this.state;
    if (reason === 'nao-quero') {
      return this.withState({
        foodFeedback: {
          ...foodFeedback,
          [foodName]: foodFeedback[foodName] ?? 'nao-quero',
        },
        mealFoodSwaps: {
          ...mealFoodSwaps,
          [mealId]: { ...mealFoodSwaps[mealId], [foodName]: substitute ?? '' },
        },
      });
    }
    return this.withState({
      foodFeedback: { ...foodFeedback, [foodName]: reason },
      foodSubstitutes: { ...foodSubstitutes, [foodName]: substitute ?? '' },
    });
  }

  /** Alimentos restritos, para a página Alimentos (em ordem alfabética). */
  restrictedFoods(): RestrictedFood[] {
    const { foodFeedback, foodSubstitutes, mealFoodSwaps } = this.state;
    return Object.entries(foodFeedback)
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([name, feedback]) => {
        const swap =
          foodSubstitutes[name] ??
          Object.values(mealFoodSwaps)
            .map((swaps) => swaps[name])
            .find((value) => value !== undefined);
        return {
          name,
          feedback,
          group: this.foods.entry(name)?.group ?? null,
          onlyInMeal: feedback === 'nao-quero',
          substitute: swap ? swap : null,
        };
      });
  }

  /** Libera o alimento para o assistente voltar a recomendá-lo. Trocas já feitas continuam. */
  releaseFood(name: string): PlanState {
    if (!this.state.foodFeedback[name])
      throw new PlanRuleError('not-found', FOOD_NOT_FOUND);
    const foodFeedback = { ...this.state.foodFeedback };
    delete foodFeedback[name];
    return this.withState({ foodFeedback });
  }
}

/** Só os campos de `PlanFood` (tira o `id` de um alimento acrescentado). */
function plain({ name, grams, carbs, protein, fat, kcal }: PlanFood): PlanFood {
  return { name, grams, carbs, protein, fat, kcal };
}
