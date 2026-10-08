// Regras do plano do dia (porte de `reference/MealPlan.tsx` e das funções de `reference/auth.ts`).
// Tudo puro: recebe o estado do usuário e devolve o novo estado ou uma prévia, sem I/O.
import type {
  CreateMealPreview,
  FoodFeedback,
  FoodSearchResult,
  KcalChange,
  PlanMeal,
  RemovalOptions,
  RemoveMealOption,
  RestrictedFood,
  TodayPlan,
  Totals,
} from '../../contract.js';
import {
  FoodCatalog,
  scaleFoods,
  sumTotals,
  usesRestrictedFood,
} from './foods.js';
import type {
  Catalog,
  DayPlanChanges,
  MealPeriod,
  MealSuggestion,
  PlanChanges,
  PlanFood,
  PlannerOptions,
  PlanState,
} from './types.js';
import { DEFAULT_PLANNER_OPTIONS } from './types.js';

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
export const FOOD_NOT_FOUND = 'Alimento não encontrado.';

export class Planner {
  private readonly foods: FoodCatalog;
  /** O que o usuário vê hoje. */
  readonly plan: BuiltMeal[];
  /** Só com as mudanças permanentes: base para criar refeições e acrescentar alimentos. */
  private readonly permanentPlan: BuiltMeal[];
  private readonly todayScales: Record<number, number>;
  /** Refeições do plano base que entram no plano inicial, pelas refeições por dia do perfil. */
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
    this.baseMeals = catalog.baseMeals.filter(
      (meal) => (meal.minMealsPerDay ?? 3) <= options.mealsPerDay,
    );
    this.goalFactor = goalFactor(
      this.baseMeals.map((meal) => meal.foods),
      options.calorieGoal,
    );
    this.plan = this.buildPlan(state.planChanges, state.dayPlan);
    this.permanentPlan = this.buildPlan(state.planChanges);
    this.todayScales = Object.fromEntries(
      this.plan.map((meal) => [
        meal.id,
        (state.planChanges.scales[meal.id] ?? 1) *
          (state.dayPlan.scales[meal.id] ?? 1),
      ]),
    );
  }

  /** Plano com as mudanças permanentes `changes` e, se `day` vier, também com as de hoje. */
  private buildPlan(changes: PlanChanges, day?: DayPlanChanges): BuiltMeal[] {
    const { mealTimes, foodSubstitutes, mealFoodSwaps } = this.state;
    const baseMeals = [
      ...this.baseMeals.map((meal) => ({
        ...meal,
        time: mealTimes[meal.id] ?? meal.time,
      })),
      ...changes.added,
    ];
    return baseMeals
      .filter(
        (meal) =>
          !changes.removed.includes(meal.id) && !day?.removed.includes(meal.id),
      )
      .map((meal) => {
        const replacement = day?.replacements[meal.id];
        const scale =
          (changes.scales[meal.id] ?? 1) * (day?.scales[meal.id] ?? 1);
        // As trocas da refeição ("Não quero") valem por cima das gerais ("Não gosto"/"Não tenho").
        const swaps = { ...foodSubstitutes, ...mealFoodSwaps[meal.id] };
        const planFoods = this.foods
          .resolve(replacement?.foods ?? meal.foods, swaps)
          .map((food) => ({ ...food, extraId: null as string | null }));
        const extras = (changes.extraFoods[meal.id] ?? []).flatMap((extra) =>
          this.foods
            .resolve([extra], swaps)
            .map((resolved) => ({ ...plain(resolved), extraId: extra.id })),
        );
        const baseFoods = [...planFoods, ...extras];
        // Porções ajustadas: menores quando uma refeição ou alimento novo abriu espaço, maiores
        // quando receberam as calorias de uma refeição removida.
        const foods = scaleFoods(baseFoods, this.goalFactor * scale);
        return {
          id: meal.id,
          title: replacement?.title ?? meal.title,
          time: meal.time,
          totals: sumTotals(foods),
          foods,
          totalsAt: (nextScale: number) =>
            sumTotals(scaleFoods(baseFoods, this.goalFactor * nextScale)),
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
      // Com o assistente sempre há o que sugerir; sem ele, só enquanto houver sugestões da lista fixa.
      canCreateMeal:
        this.options.composerAvailable === true ||
        this.availableAlternatives().length > 0,
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

  private withDayPlan(changes: Partial<DayPlanChanges>): PlanState {
    return this.withState({ dayPlan: { ...this.state.dayPlan, ...changes } });
  }

  // ---------------------------------------------------------------------------------------------
  // Sugestões de refeição

  /** O assistente evita sugerir refeições com alimentos restritos (enquanto não forem liberados). */
  private byRestriction = (a: MealSuggestion, b: MealSuggestion) =>
    Number(usesRestrictedFood(a.foods, this.state.foodFeedback)) -
    Number(usesRestrictedFood(b.foods, this.state.foodFeedback));

  /** Sugestões que ainda não estão no plano, preferindo as sem alimentos restritos. */
  availableAlternatives(): MealSuggestion[] {
    const { planChanges, dayPlan } = this.state;
    const usedTitles = new Set([
      ...this.catalog.baseMeals.map((meal) => meal.title),
      ...Object.values(dayPlan.replacements).map((meal) => meal.title),
      ...planChanges.added.map((meal) => meal.suggestion),
    ]);
    return this.catalog.suggestions
      .filter((meal) => !usedTitles.has(meal.title))
      .sort(this.byRestriction);
  }

  // ---------------------------------------------------------------------------------------------
  // Porções

  /**
   * Fator que todas as refeições do plano permanente recebem para o total do dia passar a ser
   * `targetKcal` (abrir espaço para calorias novas sem passar do total atual).
   */
  private shareFactor(meals: BuiltMeal[], targetKcal: number) {
    const currentKcal = sumTotals(meals.map((meal) => meal.totals)).kcal;
    if (currentKcal === 0) return 1;
    return fitFactor(
      meals,
      this.state.planChanges.scales,
      targetKcal / currentKcal,
      targetKcal,
    );
  }

  /** Como ficam as refeições de hoje se as porções permanentes mudarem por `factor`. */
  private previewSources(factor: number): KcalChange[] {
    return this.plan.map((meal) => ({
      mealId: meal.id,
      title: meal.title,
      time: meal.time,
      before: meal.totals.kcal,
      after: meal.totalsAt(this.todayScales[meal.id] * factor).kcal,
    }));
  }

  /** Todas as refeições do plano permanente com as porções multiplicadas por `factor`. */
  private scaleAll(factor: number) {
    const { scales } = this.state.planChanges;
    const nextScales = { ...scales };
    for (const meal of this.permanentPlan)
      nextScales[meal.id] = (scales[meal.id] ?? 1) * factor;
    return nextScales;
  }

  // ---------------------------------------------------------------------------------------------
  // Criar refeição

  /**
   * Sugestão da lista fixa para um horário: a primeira do período que ainda não está no plano, preferindo
   * as sem alimentos restritos; se acabarem, repete. É a reserva quando o assistente não compõe uma.
   */
  private fixedSuggestion(time: string): MealSuggestion {
    const all = this.catalog.suggestions;
    if (all.length === 0)
      throw new PlanRuleError(
        'invalid',
        'Não há sugestões de refeição disponíveis.',
      );
    const period = mealPeriod(time);
    const inPeriod = (meal: MealSuggestion) => meal.periods.includes(period);
    return (
      this.availableAlternatives().find(inPeriod) ??
      [...all].sort(this.byRestriction).find(inPeriod) ??
      all[0]
    );
  }

  /**
   * Quanto a refeição nova deve ter, para o assistente compor os alimentos: kcal (a parte justa da meta
   * ou do dia) e, com `macroGoals`, os gramas de cada macro que faltam no dia depois de as outras
   * refeições se ajustarem.
   */
  newMealTargets(
    macroGoals: { protein: number; fat: number; carbs: number } | null,
  ) {
    const others = sumTotals(this.permanentPlan.map((meal) => meal.totals));
    const mealCount = this.permanentPlan.length + 1;
    const goal = this.options.calorieGoal;
    const kcal = Math.round(
      goal ? goal / mealCount : others.kcal > 0 ? others.kcal / mealCount : 500,
    );
    if (!macroGoals) return { kcal, macros: null };
    // As outras refeições passam a somar `goal − kcal`, na mesma proporção de macros de hoje.
    const othersShare =
      others.kcal > 0 && goal ? Math.max(0, goal - kcal) / others.kcal : 0;
    const remaining = (target: number, current: number) =>
      Math.max(0, Math.round(target - current * othersShare));
    return {
      kcal,
      macros: {
        protein: remaining(macroGoals.protein, others.protein),
        fat: remaining(macroGoals.fat, others.fat),
        carbs: remaining(macroGoals.carbs, others.carbs),
      },
    };
  }

  /**
   * Refeição nova a partir de uma sugestão: a composta pelo assistente (`composed`) ou a da lista fixa
   * para o período. Com meta calórica, o dia volta para a meta: a nova
   * fica com `meta ÷ (nº de refeições + 1)` e as outras se ajustam na mesma proporção. Sem meta, o total
   * do dia não muda: a nova fica com no máximo a "parte justa" do dia e as outras diminuem.
   */
  private planNewMeal(time: string, composed?: MealSuggestion) {
    const suggestion = composed ?? this.fixedSuggestion(time);

    const dayKcal = sumTotals(
      this.permanentPlan.map((meal) => meal.totals),
    ).kcal;
    const suggestedKcal = sumTotals(suggestion.foods).kcal;
    const goal = this.options.calorieGoal;
    const mealCount = this.permanentPlan.length + 1;
    let portion: number;
    let othersTarget: number;
    if (goal && suggestedKcal > 0) {
      // Com meta: depois de criar, o dia volta para a meta. A refeição nova fica com a parte justa da
      // meta e as outras se ajustam (diminuem ou aumentam) para o total ficar nela.
      portion = goal / mealCount / suggestedKcal;
      othersTarget = goal - this.newMealTotals(suggestion.foods, portion).kcal;
    } else {
      // Sem meta: o total do dia não muda. A refeição nova fica com no máximo a parte justa do dia;
      // com o plano vazio, entra com a porção original.
      portion =
        dayKcal === 0 || suggestedKcal === 0
          ? 1
          : Math.min(1, dayKcal / mealCount / suggestedKcal);
      othersTarget =
        dayKcal - this.newMealTotals(suggestion.foods, portion).kcal;
    }
    const totals = this.newMealTotals(suggestion.foods, portion);
    const othersFactor = this.shareFactor(this.permanentPlan, othersTarget);
    return {
      suggestion: suggestion.title,
      foods: suggestion.foods,
      portion,
      totals,
      othersFactor,
    };
  }

  /**
   * Totais da refeição nova como o plano vai mostrar: ela é guardada com o fator `portion ÷ goalFactor`
   * e montada com `goalFactor ×` esse fator (a mesma conta, para o arredondamento bater).
   */
  private newMealTotals(foods: PlanFood[], portion: number) {
    return sumTotals(
      scaleFoods(foods, this.goalFactor * (portion / this.goalFactor)),
    );
  }

  createMeal(
    title: string,
    time: string,
    composed?: MealSuggestion,
  ): PlanState {
    const { suggestion, foods, portion, othersFactor } = this.planNewMeal(
      time,
      composed,
    );
    const { added } = this.state.planChanges;
    const id = Math.max(1000, ...added.map((meal) => meal.id)) + 1;
    // A refeição guarda os alimentos da sugestão e o fator da porção escolhida (sem o da meta, que
    // entra ao montar o plano).
    return this.withPlanChanges({
      scales: {
        ...this.scaleAll(othersFactor),
        [id]: portion / this.goalFactor,
      },
      added: [...added, { id, title, time, suggestion, foods }],
    });
  }

  previewNewMeal(
    title: string,
    time: string,
    composed?: MealSuggestion,
  ): CreateMealPreview {
    const { suggestion, totals, othersFactor } = this.planNewMeal(
      time,
      composed,
    );
    const after = new Planner(
      this.catalog,
      this.createMeal(title, time, composed),
      this.options,
    );
    const created = after.plan.find(
      (meal) => !this.plan.some((item) => item.id === meal.id),
    );
    return {
      suggestion,
      foods: (created?.foods ?? []).map(
        ({ name, grams, carbs, protein, fat, kcal }) => ({
          name,
          grams,
          carbs,
          protein,
          fat,
          kcal,
        }),
      ),
      totals,
      reductionPercent: Math.round((1 - othersFactor) * 100),
      changes: this.previewSources(othersFactor),
      dayKcal: after.dayKcal(),
    };
  }

  /** Total de calorias do plano de hoje. */
  dayKcal() {
    return sumTotals(this.plan.map((meal) => meal.totals)).kcal;
  }

  // ---------------------------------------------------------------------------------------------
  // Acrescentar e remover alimento

  /**
   * Porção que o assistente escolhe para `foodName` na refeição — a média dos alimentos dela em kcal —
   * e o fator que todas as refeições recebem para o total do dia não aumentar.
   */
  private planFood(mealId: number, foodName: string) {
    const meal = this.permanentPlan.find((item) => item.id === mealId);
    if (!meal) return null;
    const dayKcal = sumTotals(
      this.permanentPlan.map((item) => item.totals),
    ).kcal;
    const portionKcal =
      Math.round(meal.totals.kcal / (meal.foods.length + 1)) || 100;
    const food = this.foods.convert(foodName, portionKcal);
    if (!food) return null;
    const factor = this.shareFactor(this.permanentPlan, dayKcal - food.kcal);
    return { food, reductionPercent: Math.round((1 - factor) * 100), factor };
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
        const planned = this.planFood(mealId, food.name);
        return planned
          ? [{ food: planned.food, reductionPercent: planned.reductionPercent }]
          : [];
      }),
    };
  }

  addFood(mealId: number, foodName: string): PlanState {
    this.meal(mealId);
    if (this.state.foodFeedback[foodName]) {
      throw new PlanRuleError(
        'invalid',
        'Esse alimento está restrito. Libere-o na página Alimentos para usá-lo.',
      );
    }
    const planned = this.planFood(mealId, foodName);
    if (!planned) throw new PlanRuleError('not-found', FOOD_NOT_FOUND);
    // Guardado na porção "fator 1" da refeição (sem o fator da meta), para acompanhar as mudanças de
    // porção dela.
    const base = this.foods.convert(
      planned.food.name,
      planned.food.kcal /
        ((this.scaleAll(planned.factor)[mealId] ?? 1) * this.goalFactor),
    );
    if (!base) throw new PlanRuleError('not-found', FOOD_NOT_FOUND);
    const { extraFoods } = this.state.planChanges;
    const extra = { ...base, id: `x-${this.state.nextExtraId}` };
    const withFactor = (factor: number): PlanState => ({
      ...this.withPlanChanges({
        scales: this.scaleAll(factor),
        extraFoods: {
          ...extraFoods,
          [mealId]: [...(extraFoods[mealId] ?? []), extra],
        },
      }),
      nextExtraId: this.state.nextExtraId + 1,
    });
    // As gramas do alimento guardado são inteiras: com as porções escaladas, o total arredondado pode
    // passar do anterior por pouco. Aperta o fator (×0,999) até o dia não ganhar calorias.
    const limit = this.dayKcal();
    let factor = planned.factor;
    let next = withFactor(factor);
    for (
      let i = 0;
      i < 200 &&
      new Planner(this.catalog, next, this.options).dayKcal() > limit;
      i++
    ) {
      factor *= 0.999;
      next = withFactor(factor);
    }
    return next;
  }

  /** Tira um alimento acrescentado; as calorias dele voltam para as refeições do dia. */
  removeExtraFood(mealId: number, extraId: string): PlanState {
    this.meal(mealId);
    const { planChanges } = this.state;
    const current = planChanges.extraFoods[mealId] ?? [];
    if (!current.some((food) => food.id === extraId))
      throw new PlanRuleError('not-found', FOOD_NOT_FOUND);

    const dayKcal = sumTotals(
      this.permanentPlan.map((meal) => meal.totals),
    ).kcal;
    const extraFoods = {
      ...planChanges.extraFoods,
      [mealId]: current.filter((food) => food.id !== extraId),
    };
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
    const { added } = this.state.planChanges;
    // Refeições criadas guardam o horário junto delas; as do plano base, nos horários do usuário.
    if (added.some((meal) => meal.id === id)) {
      return this.withPlanChanges({
        added: added.map((meal) => (meal.id === id ? { ...meal, time } : meal)),
      });
    }
    return this.withState({
      mealTimes: { ...this.state.mealTimes, [id]: time },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Remover refeição

  /**
   * "Redistribuir": as refeições seguintes aumentam as porções na mesma proporção para receber as
   * calorias da removida, sem passar do total que o dia tinha.
   */
  private planRedistribution(mealId: number) {
    const removing = this.meal(mealId);
    const nextMeals = this.plan.filter((meal) => meal.time > removing.time);
    if (nextMeals.length === 0)
      return { nextMeals, factor: 1, preview: [] as KcalChange[] };
    const nextKcal = nextMeals.reduce((sum, meal) => sum + meal.totals.kcal, 0);
    const limit = nextKcal + removing.totals.kcal;
    const factor =
      nextKcal === 0
        ? 1
        : fitFactor(nextMeals, this.todayScales, limit / nextKcal, limit);
    return {
      nextMeals,
      factor,
      preview: nextMeals.map((meal) => ({
        mealId: meal.id,
        title: meal.title,
        time: meal.time,
        before: meal.totals.kcal,
        after: meal.totalsAt(this.todayScales[meal.id] * factor).kcal,
      })),
    };
  }

  /**
   * "Sugerir uma nova": a sugestão de calorias mais próximas da porção original (fator 1) da
   * refeição, entre as que não estão no plano, preferindo as sem alimentos restritos.
   */
  private removalSuggestion(mealId: number) {
    // Porção original da refeição, na mesma escala das sugestões (sem o fator da meta).
    const target = this.meal(mealId).totalsAt(1).kcal / this.goalFactor;
    const [alternative] = [...this.availableAlternatives()].sort(
      (a, b) =>
        this.byRestriction(a, b) ||
        Math.abs(sumTotals(a.foods).kcal - target) -
          Math.abs(sumTotals(b.foods).kcal - target),
    );
    return alternative;
  }

  removalOptions(mealId: number): RemovalOptions {
    const alternative = this.removalSuggestion(mealId);
    let suggestion: RemovalOptions['suggestion'] = null;
    if (alternative) {
      // A sugestão herda o ajuste de porção da refeição: mostra as calorias como vão aparecer.
      const after = new Planner(
        this.catalog,
        this.confirmRemoval(mealId, 'suggest'),
        this.options,
      );
      suggestion = {
        title: alternative.title,
        kcal: after.meal(mealId).totals.kcal,
      };
    }
    return {
      suggestion,
      redistribution: this.planRedistribution(mealId).preview,
    };
  }

  confirmRemoval(mealId: number, option: RemoveMealOption): PlanState {
    this.meal(mealId);
    const { planChanges, dayPlan } = this.state;

    if (option === 'suggest') {
      const alternative = this.removalSuggestion(mealId);
      if (!alternative)
        throw new PlanRuleError(
          'invalid',
          'Não há outra refeição para sugerir agora.',
        );
      return this.withDayPlan({
        replacements: {
          ...dayPlan.replacements,
          [mealId]: { title: alternative.title, foods: alternative.foods },
        },
      });
    }

    if (option === 'redistribute') {
      const { nextMeals, factor } = this.planRedistribution(mealId);
      if (nextMeals.length === 0) {
        throw new PlanRuleError(
          'invalid',
          'Não há refeições depois desta para receber as calorias.',
        );
      }
      const scales = { ...dayPlan.scales };
      for (const meal of nextMeals)
        scales[meal.id] = (dayPlan.scales[meal.id] ?? 1) * factor;
      return this.withDayPlan({
        removed: [...dayPlan.removed, mealId],
        scales,
      });
    }

    // "Não fazer nada" é permanente: para voltar a ter a refeição, o usuário cria outra.
    const extraFoods = { ...planChanges.extraFoods };
    delete extraFoods[mealId];
    const isCreated = planChanges.added.some((meal) => meal.id === mealId);
    return this.withPlanChanges({
      extraFoods,
      added: planChanges.added.filter((meal) => meal.id !== mealId),
      removed: isCreated
        ? planChanges.removed
        : [...planChanges.removed, mealId],
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
   * mesmo grupo mais parecidos em macronutrientes. No máximo `MAX_SUBSTITUTES`.
   */
  substitutes(mealId: number, foodName: string, names?: string[]): PlanFood[] {
    const food = this.mealFood(mealId, foodName);
    const feedback = this.state.foodFeedback;
    if (!names)
      return this.foods.substituteOptions(
        foodName,
        food.kcal,
        feedback,
        MAX_SUBSTITUTES,
      );
    return [...new Set(names)]
      .flatMap(
        (name) =>
          this.foods.substitute(name, foodName, food.kcal, feedback) ?? [],
      )
      .slice(0, MAX_SUBSTITUTES);
  }

  /**
   * "Não gosto" / "Não tenho": troca permanente em todas as refeições e o alimento fica restrito.
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
      const valid = this.foods.substitute(
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
