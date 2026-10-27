import {
  testBaseMeals as baseMeals,
  testCatalog as catalog,
  testFoods as foodCatalog,
} from './test-catalog.js';
import { FoodCatalog, similarity, sumTotals } from './foods.js';
import {
  goalFactor,
  MAX_MACRO_SHIFT,
  macroWeights,
  Planner,
  PlanRuleError,
} from './planner.js';
import {
  DEFAULT_PLANNER_OPTIONS,
  EMPTY_PLAN_CHANGES,
  type PlannerOptions,
  type PlanState,
} from './types.js';

const EMPTY_STATE: PlanState = {
  mealTimes: {},
  planChanges: EMPTY_PLAN_CHANGES,
  foodFeedback: {},
  foodSubstitutes: {},
  mealFoodSwaps: {},
  nextExtraId: 1,
};

const planner = (state: PlanState = EMPTY_STATE) => new Planner(catalog, state);
const kcalOf = (p: Planner) => p.plan.map((meal) => meal.totals.kcal);

/** As refeições de quem faz `count` por dia, na ordem em que entram: as três principais, depois os lanches e a ceia. */
const mealsFor = (count: number) =>
  (
    [
      'cafe-da-manha',
      'almoco',
      'jantar',
      'lanche-da-tarde',
      'lanche-da-manha',
      'ceia',
    ] as const
  ).slice(0, count);

describe('catálogo de teste', () => {
  it('tem todo alimento do plano base', () => {
    const foods = new FoodCatalog(foodCatalog);
    const missing = baseMeals
      .flatMap((meal) => meal.foods)
      .filter((food) => !foods.entry(food.name))
      .map((food) => food.name);
    expect(missing).toEqual([]);
  });
});

describe('Planner', () => {
  it('monta o plano base ordenado por horário', () => {
    const p = planner();
    expect(p.plan.map((meal) => meal.title)).toEqual([
      'Torrada de Abacate com Ovo Poché',
      'Tacos de Camarão Grelhado com Salsa de Manga',
      'Bowl de Salmão com Quinoa e Legumes',
    ]);
    // O ovo poché de 50 g vai como 1 unidade de 55 g.
    expect(kcalOf(p)).toEqual([357, 375, 435]);
    expect(p.plan[0].foods.every((food) => food.extraId === null)).toBe(true);
  });

  it('usa o horário escolhido e reordena', () => {
    const state = planner().changeMealTime(1, '21:00');
    expect(planner(state).plan.map((meal) => meal.id)).toEqual([2, 3, 1]);
  });

  describe('acrescentar alimento', () => {
    it('busca sem diferenciar acentos e sugere a porção', () => {
      const result = planner().searchFoods(1, 'pao integral');
      expect(result.found).toBe(true);
      expect(result.options.map((option) => option.food.name)).toEqual([
        'Pão integral',
      ]);
      // kcal da refeição ÷ (nº de alimentos + 1) = 350 / 5 = 70.
      expect(result.options[0].food.kcal).toBe(70);
    });

    it('ignora pontuação na busca', () => {
      const result = planner().searchFoods(1, 'banana prata');
      expect(result.found).toBe(true);
      expect(result.options.map((option) => option.food.name)).toEqual([
        'Banana-prata',
      ]);
    });

    it('sugere os 5 mais parecidos quando nada bate', () => {
      const result = planner().searchFoods(1, 'bananna');
      expect(result.found).toBe(false);
      expect(result.options).toHaveLength(5);
      expect(result.options[0].food.name).toBe('Banana-prata');
      expect(similarity('banan', 'Banana-prata')).toBeGreaterThan(0.5);
    });

    it('nunca mostra restritos e avisa quando o texto é um deles', () => {
      const state = planner().swapFood(2, 'Guacamole', 'nao-gosto', 'Abacate');
      const result = planner(state).searchFoods(1, 'guacamole');
      expect(result.restricted).toEqual({
        name: 'Guacamole',
        feedback: 'nao-gosto',
      });
      expect(result.found).toBe(false);
      expect(result.options.map((option) => option.food.name)).not.toContain(
        'Guacamole',
      );
    });

    it('acrescenta o extra nas gramas do usuário, somando ao dia, e remove sem mexer no resto', () => {
      const before = planner();
      const added = planner(before.addFood(1, 'Banana-prata', 150));

      const extra = added.meal(1).foods.find((food) => food.extraId !== null)!;
      expect(extra).toEqual({
        ...before.foodPortion(1, 'Banana-prata', 150),
        extraId: 'x-1',
      });
      expect(extra.grams).toBe(150);
      expect(added.state.nextExtraId).toBe(2);
      // As outras porções não mudam; o dia ganha as calorias do extra.
      expect(added.dayKcal()).toBe(before.dayKcal() + extra.kcal);
      for (const meal of before.plan)
        expect(
          added.meal(meal.id).foods.filter((food) => food.extraId === null),
        ).toEqual(meal.foods);

      const removed = planner(added.removeExtraFood(1, 'x-1'));
      expect(removed.todayPlan()).toEqual(before.todayPlan());
    });

    it('extra antigo (sem gramas fixas) continua escalado com a refeição', () => {
      const base = planner();
      const legacy = {
        ...base.state,
        planChanges: {
          ...base.state.planChanges,
          extraFoods: {
            1: [{ ...base.foodPortion(1, 'Banana-prata', 100), id: 'x-1' }],
          },
          scales: { 1: 0.5 },
        },
        nextExtraId: 2,
      };
      const extra = planner(legacy)
        .meal(1)
        .foods.find((food) => food.extraId === 'x-1')!;
      expect(extra.grams).toBe(50);
    });

    describe('vale só no dia em que entrou', () => {
      const TODAY = '2026-10-26';
      const onDay = (state: PlanState, today?: string) =>
        new Planner(catalog, state, { ...DEFAULT_PLANNER_OPTIONS, today });

      it('guarda o dia e some no dia seguinte, com o total de antes', () => {
        const before = onDay(EMPTY_STATE, TODAY);
        const state = before.addFood(1, 'Banana-prata', 150);
        expect(state.planChanges.extraFoods[1][0].date).toBe(TODAY);
        const today = onDay(state, TODAY);
        expect(today.expired).toBe(false);
        expect(today.dayKcal()).toBeGreaterThan(before.dayKcal());

        const tomorrow = onDay(state, '2026-10-27');
        expect(tomorrow.expired).toBe(true);
        expect(tomorrow.state.planChanges.extraFoods[1]).toEqual([]);
        expect(tomorrow.todayPlan()).toEqual(before.todayPlan());
        expect(() => tomorrow.removeExtraFood(1, 'x-1')).toThrow(
          'Alimento não encontrado.',
        );
      });

      it('sem o dia de hoje, nada expira', () => {
        const state = onDay(EMPTY_STATE, TODAY).addFood(1, 'Banana-prata', 150);
        expect(onDay(state).expired).toBe(false);
        expect(onDay(state).state).toEqual(state);
      });

      it('o antigo (sem gramas fixas) sai com as calorias de volta para as refeições', () => {
        const base = planner();
        const legacy: PlanState = {
          ...base.state,
          planChanges: {
            extraFoods: {
              1: [
                {
                  ...base.foodPortion(1, 'Banana-prata', 100),
                  id: 'x-1',
                  date: '2026-10-25',
                },
              ],
            },
            scales: { 1: 0.8, 2: 0.8, 3: 0.8 },
          },
          nextExtraId: 2,
        };
        const yesterday = onDay(legacy, '2026-10-25');
        const today = onDay(legacy, TODAY);
        expect(today.expired).toBe(true);
        expect(
          today.plan.flatMap((meal) => meal.foods).some((food) => food.extraId),
        ).toBe(false);
        expect(
          Math.abs(today.dayKcal() - yesterday.dayKcal()),
        ).toBeLessThanOrEqual(yesterday.dayKcal() * 0.01);
      });
    });

    it('prévia: as gramas pedidas com os nutrientes do catálogo', () => {
      expect(planner().foodPortion(1, 'Banana-prata', 200)).toMatchObject({
        name: 'Banana-prata',
        grams: 200,
      });
    });

    it('recusa alimento restrito ou desconhecido', () => {
      const state = planner().swapFood(2, 'Guacamole', 'nao-gosto', null);
      expect(() => planner(state).addFood(1, 'Guacamole', 50)).toThrow(
        PlanRuleError,
      );
      expect(() => planner(state).foodPortion(1, 'Guacamole', 50)).toThrow(
        PlanRuleError,
      );
      expect(() => planner().addFood(1, 'Pizza', 50)).toThrow(
        'Alimento não encontrado.',
      );
      expect(() => planner().removeExtraFood(1, 'x-9')).toThrow(
        'Alimento não encontrado.',
      );
    });
  });

  describe('trocas', () => {
    it('não posso troca em todas as refeições e marca o alimento', () => {
      const state = planner().swapFood(1, 'Azeite de oliva', 'nao-posso', null);
      const p = planner(state);
      for (const id of [1, 3])
        expect(p.meal(id).foods.map((food) => food.name)).not.toContain(
          'Azeite de oliva',
        );
      expect(state.foodFeedback['Azeite de oliva']).toBe('nao-posso');
    });

    it('não gosto troca em todas as refeições, com as mesmas calorias, seguindo a cadeia', () => {
      let state = planner().swapFood(2, 'Guacamole', 'nao-gosto', 'Abacate');
      // 65 kcal de Guacamole = 33 g de Abacate (as gramas são inteiras, então as kcal ficam próximas).
      expect(
        planner(state)
          .meal(2)
          .foods.find((food) => food.name === 'Abacate'),
      ).toMatchObject({ grams: 33, kcal: 66 });

      // Abacate → Azeite: o Guacamole (já trocado por Abacate) vira Azeite também.
      state = planner(state).swapFood(
        1,
        'Abacate',
        'nao-tenho',
        'Azeite de oliva',
      );
      const p = planner(state);
      expect(p.meal(1).foods.map((food) => food.name)).not.toContain('Abacate');
      const azeiteNoTaco = p
        .meal(2)
        .foods.find((food) => food.name === 'Azeite de oliva')!;
      expect(azeiteNoTaco.kcal).toBe(64);
      expect(azeiteNoTaco.grams).toBe(8);
    });

    it('não quero troca só nesta refeição e não sobrescreve a marcação', () => {
      const state = planner().swapFood(1, 'Azeite de oliva', 'nao-quero', null);
      const p = planner(state);
      expect(p.meal(1).foods.map((food) => food.name)).not.toContain(
        'Azeite de oliva',
      );
      expect(p.meal(3).foods.map((food) => food.name)).toContain(
        'Azeite de oliva',
      );
      expect(p.restrictedFoods()).toEqual([
        {
          name: 'Azeite de oliva',
          feedback: 'nao-quero',
          group: 'gorduras',
          onlyInMeal: true,
          substitute: null,
        },
      ]);

      const marked = planner().swapFood(2, 'Guacamole', 'nao-gosto', 'Abacate');
      const again = planner(
        planner(marked).swapFood(1, 'Abacate', 'nao-quero', 'Azeite de oliva'),
      );
      expect(again.state.foodFeedback).toEqual({
        Guacamole: 'nao-gosto',
        Abacate: 'nao-quero',
      });
    });

    it('substitutos do mesmo grupo, sem o próprio e sem restritos, com as mesmas calorias', () => {
      const state = planner().swapFood(1, 'Azeite de oliva', 'nao-quero', null);
      const options = planner(state).substitutes(2, 'Guacamole');
      const names = options.map((food) => food.name);
      expect(names).toContain('Abacate');
      expect(names).not.toContain('Guacamole');
      expect(names).not.toContain('Azeite de oliva');
      expect(options.every((food) => Math.abs(food.kcal - 65) <= 3)).toBe(true);
    });

    it('sem nomes do assistente, até 8 do mesmo grupo, os de macros mais parecidos primeiro', () => {
      const options = planner().substitutes(2, 'Guacamole');
      expect(options.map((food) => food.name)).toEqual([
        'Abacate',
        'Azeite de oliva',
        'Mix de castanhas',
        'Pasta de amendoim integral',
        'Semente de chia',
      ]);
    });

    it('"Ver mais": sem os já mostrados, com e sem os nomes do assistente', () => {
      const shown = ['Abacate', 'Azeite de oliva'];
      expect(
        planner()
          .substitutes(2, 'Guacamole', undefined, shown)
          .map((food) => food.name),
      ).toEqual([
        'Mix de castanhas',
        'Pasta de amendoim integral',
        'Semente de chia',
      ]);
      expect(
        planner()
          .substitutes(2, 'Guacamole', ['Abacate', 'Banana-prata'], shown)
          .map((food) => food.name),
      ).toEqual(['Banana-prata']);
    });

    it('pesquisa: por parte do nome, sem acento, com as mesmas calorias, sem o próprio e sem restritos', () => {
      const found = planner().searchSubstitutes(2, 'Guacamole', 'BANANA');
      expect(found.map((food) => food.name)).toEqual(['Banana-prata']);
      expect(Math.abs(found[0].kcal - 65)).toBeLessThanOrEqual(3);

      expect(
        planner()
          .searchSubstitutes(2, 'Guacamole', 'guaca')
          .map((food) => food.name),
      ).not.toContain('Guacamole');
      const state = planner().swapFood(1, 'Abacate', 'nao-posso', null);
      expect(
        planner(state)
          .searchSubstitutes(2, 'Guacamole', 'abacate')
          .map((food) => food.name),
      ).not.toContain('Abacate');
      // Nenhum nome bate: os mais parecidos.
      expect(
        planner().searchSubstitutes(2, 'Guacamole', 'bananna').length,
      ).toBeGreaterThan(0);
    });

    it('com os nomes do assistente: na ordem dele, de qualquer grupo, só os válidos', () => {
      const state = planner().swapFood(1, 'Azeite de oliva', 'nao-quero', null);
      const options = planner(state).substitutes(2, 'Guacamole', [
        'Banana-prata',
        'Não existe',
        'Guacamole',
        'Azeite de oliva',
        'Abacate',
        'Banana-prata',
      ]);
      expect(options.map((food) => food.name)).toEqual([
        'Banana-prata',
        'Abacate',
      ]);
      expect(options.every((food) => Math.abs(food.kcal - 65) <= 3)).toBe(true);
    });

    it('troca por alimento de outro grupo; recusa restrito, o próprio e inexistente', () => {
      const swapped = planner(
        planner().swapFood(2, 'Guacamole', 'nao-gosto', 'Banana-prata'),
      );
      expect(swapped.meal(2).foods.map((food) => food.name)).toContain(
        'Banana-prata',
      );
      const restricted = planner().swapFood(
        1,
        'Azeite de oliva',
        'nao-quero',
        null,
      );
      for (const substitute of ['Azeite de oliva', 'Guacamole', 'Não existe'])
        expect(() =>
          planner(restricted).swapFood(2, 'Guacamole', 'nao-gosto', substitute),
        ).toThrow(PlanRuleError);
    });

    it('liberar tira a restrição mas mantém a troca', () => {
      const state = planner().swapFood(2, 'Guacamole', 'nao-gosto', 'Abacate');
      const released = planner(planner(state).releaseFood('Guacamole'));
      expect(released.restrictedFoods()).toEqual([]);
      expect(released.meal(2).foods.map((food) => food.name)).toContain(
        'Abacate',
      );
    });
  });
});

describe('plano individual do assistente', () => {
  const personal = (state: PlanState, calorieGoal: number | null = null) =>
    new Planner(catalog, state, { calorieGoal, meals: mealsFor(4) });
  const foodsCatalog = new FoodCatalog(catalog.foods);
  const tapioca = {
    title: 'Tofu com Pão Integral',
    foods: [
      foodsCatalog.portion('Tofu', 150)!,
      foodsCatalog.portion('Pão integral', 50)!,
    ],
  };

  it('troca título e alimentos da refeição base; as outras seguem o plano base', () => {
    const p = personal({ ...EMPTY_STATE, personalMeals: { 1: tapioca } });
    const [first, second] = p.plan;
    expect(first).toMatchObject({ id: 1, title: tapioca.title, time: '07:30' });
    expect(first.foods.map((food) => food.name)).toEqual([
      'Tofu',
      'Pão integral',
    ]);
    expect(second.title).toBe(planner().plan[1].title);
  });

  it('usa o horário do assistente; o que o usuário escolher depois vale por cima', () => {
    const personalMeals = { 1: { ...tapioca, time: '13:15' } };
    const p = personal({ ...EMPTY_STATE, personalMeals });
    expect(p.plan.map((meal) => [meal.id, meal.time])).toEqual([
      [2, '12:30'],
      [1, '13:15'],
      [4, '16:00'],
      [3, '20:00'],
    ]);
    const moved = personal(p.changeMealTime(1, '06:00'));
    expect(moved.plan[0]).toMatchObject({ id: 1, time: '06:00' });
  });

  it('as porções do assistente também são escaladas para a meta', () => {
    const p = personal({ ...EMPTY_STATE, personalMeals: { 1: tapioca } }, 2000);
    expect(Math.abs(p.dayKcal() - 2000)).toBeLessThanOrEqual(20);
  });

  it('devolve o estado da montagem', () => {
    expect(planner().todayPlan().personalization).toBeNull();
    expect(
      new Planner(catalog, EMPTY_STATE, {
        ...DEFAULT_PLANNER_OPTIONS,
        personalization: 'pending',
      }).todayPlan().personalization,
    ).toBe('pending');
  });
});

describe('tipo de alimentação', () => {
  const vegetarian = (state: PlanState = EMPTY_STATE) =>
    new Planner(catalog, state, {
      ...DEFAULT_PLANNER_OPTIONS,
      diet: 'vegetariana',
    });

  it('substitutos e trocas respeitam a dieta', () => {
    const fallback = vegetarian()
      .substitutes(3, 'Salmão grelhado')
      .map((food) => food.name);
    expect(fallback.length).toBeGreaterThan(0);
    for (const name of [
      'Peito de frango grelhado',
      'Tilápia assada',
      'Atum em água',
    ])
      expect(fallback).not.toContain(name);
    expect(
      vegetarian()
        .substitutes(3, 'Salmão grelhado', ['Tilápia assada', 'Tofu'])
        .map((food) => food.name),
    ).toEqual(['Tofu']);
    expect(() =>
      vegetarian().swapFood(
        3,
        'Salmão grelhado',
        'nao-gosto',
        'Tilápia assada',
      ),
    ).toThrow(PlanRuleError);
    expect(
      vegetarian()
        .searchSubstitutes(3, 'Salmão grelhado', 'frango')
        .map((food) => food.name),
    ).not.toContain('Peito de frango grelhado');
  });
});

describe('metas de macronutrientes', () => {
  const meals = mealsFor(4);
  const goals = { protein: 160, fat: 80, carbs: 233 };
  const withMacros = (macroGoals: typeof goals | null) =>
    new Planner(catalog, EMPTY_STATE, { calorieGoal: 2290, macroGoals, meals });
  const dayTotals = (p: Planner) =>
    sumTotals(p.plan.map((meal) => meal.totals));
  const distance = (p: Planner) => {
    const totals = dayTotals(p);
    return (['protein', 'fat', 'carbs'] as const).reduce(
      (sum, macro) =>
        sum + Math.abs(totals[macro] - goals[macro]) / goals[macro],
      0,
    );
  };

  it('aproxima os macros do dia das metas, sem sair da meta calórica', () => {
    const even = withMacros(null);
    const weighted = withMacros(goals);
    expect(distance(weighted)).toBeLessThan(distance(even) / 2);
    // O ovo em unidades inteiras tira o ajuste fino de alguns gramas.
    expect(
      Math.abs(dayTotals(weighted).protein - goals.protein),
    ).toBeLessThanOrEqual(3);
    expect(Math.abs(weighted.dayKcal() - 2290)).toBeLessThanOrEqual(23);
  });

  it('os pesos ficam nos limites, para as porções seguirem realistas', () => {
    const foods = baseMeals.slice(0, 4).map((meal) => meal.foods);
    const weights = macroWeights(foods, { protein: 400, fat: 10, carbs: 50 });
    for (const weight of weights) {
      expect(weight).toBeGreaterThanOrEqual(1 / MAX_MACRO_SHIFT);
      expect(weight).toBeLessThanOrEqual(MAX_MACRO_SHIFT);
    }
  });

  it('sem metas de macros, ou sem meta calórica, todas as porções crescem igual', () => {
    expect(withMacros(null).macroWeights).toEqual([1, 1, 1]);
    const noGoal = new Planner(catalog, EMPTY_STATE, {
      calorieGoal: null,
      macroGoals: goals,
      meals,
    });
    expect(noGoal.macroWeights).toEqual([1, 1, 1]);
    expect(kcalOf(noGoal)).toEqual(
      kcalOf(new Planner(catalog, EMPTY_STATE, { calorieGoal: null, meals })),
    );
  });

  it('o fator de porção da refeição vale por cima dos pesos', () => {
    const p = withMacros(goals);
    const [preview] = p.plan;
    expect(preview.totalsAt(1)).toEqual(preview.totals);
    expect(preview.totalsAt(0.5).kcal).toBeLessThan(preview.totals.kcal);
  });
});

describe('ovo em unidades', () => {
  const egg = (p: Planner) =>
    p.meal(1).foods.find((food) => food.name === 'Ovo poché')!;
  const withEgg = (options: Partial<PlannerOptions> = {}) =>
    new Planner(catalog, EMPTY_STATE, {
      calorieGoal: null,
      meals: mealsFor(3),
      ...options,
    });

  it('o ovo vai em unidades inteiras de 55 g, com os nutrientes na proporção', () => {
    expect(egg(withEgg())).toMatchObject({ grams: 55, units: 1, kcal: 77 });
  });

  it('usa o peso da unidade do ajuste da dieta', () => {
    expect(egg(withEgg({ eggUnitGrams: 60 }))).toMatchObject({
      grams: 60,
      units: 1,
    });
  });

  it('com a meta, as porções crescem em unidades e as calorias seguem perto da meta', () => {
    const p = withEgg({ calorieGoal: 2290 });
    const food = egg(p);
    expect(food.units).toBeGreaterThan(1);
    expect(food.grams).toBe(food.units! * 55);
    expect(Math.abs(p.dayKcal() - 2290)).toBeLessThanOrEqual(23);
  });

  it('só os ovos têm unidades', () => {
    const others = withEgg()
      .plan.flatMap((meal) => meal.foods)
      .filter((food) => food.name !== 'Ovo poché');
    expect(others.every((food) => food.units === undefined)).toBe(true);
  });
});

describe('meta calórica e refeições da rotina', () => {
  const withGoal = (
    calorieGoal: number | null,
    count = 3,
    state: PlanState = EMPTY_STATE,
  ) =>
    new Planner(catalog, state, {
      calorieGoal,
      meals: mealsFor(count),
    } satisfies PlannerOptions);

  it('o plano inicial tem as refeições que o usuário faz', () => {
    const only = (meals: PlannerOptions['meals']) =>
      new Planner(catalog, EMPTY_STATE, { calorieGoal: null, meals }).plan.map(
        (meal) => meal.id,
      );
    expect(only(['ceia', 'almoco'])).toEqual([2, 6]);
    expect(only(['lanche-da-manha'])).toEqual([5]);
    expect(withGoal(null, 3).plan.map((meal) => meal.id)).toEqual([1, 2, 3]);
    expect(withGoal(null, 4).plan.map((meal) => meal.id)).toEqual([1, 2, 4, 3]);
    expect(withGoal(null, 6).plan.map((meal) => meal.id)).toEqual([
      1, 5, 2, 4, 3, 6,
    ]);
  });

  it('sem meta, as porções originais', () => {
    expect(kcalOf(withGoal(null))).toEqual([357, 375, 435]);
    expect(withGoal(null).goalFactor).toBe(1);
  });

  it.each([
    [2290, 3],
    [1660, 4],
    [1200, 6],
  ])('chega perto da meta de %i kcal com %i refeições', (goal, meals) => {
    const p = withGoal(goal, meals);
    expect(Math.abs(p.dayKcal() - goal)).toBeLessThanOrEqual(goal * 0.01);
  });

  it('o fator só ajusta em torno da proporção direta', () => {
    const foods = baseMeals.slice(0, 3).map((meal) => meal.foods);
    const factor = goalFactor(foods, 2320);
    expect(factor).toBeGreaterThan(2 * 0.95);
    expect(factor).toBeLessThan(2 * 1.05);
  });

  it('o extra soma ao dia, na meta, e remover volta ao total de antes', () => {
    const start = withGoal(2290);
    const added = withGoal(2290, 3, start.addFood(1, 'Banana-prata', 120));
    const banana = added.meal(1).foods.find((food) => food.extraId !== null)!;
    expect(banana.grams).toBe(120);
    expect(added.dayKcal()).toBe(start.dayKcal() + banana.kcal);

    const removed = withGoal(2290, 3, added.removeExtraFood(1, 'x-1'));
    expect(removed.dayKcal()).toBe(start.dayKcal());
  });

  it('mudar a meta escala o plano, mas não as gramas do extra', () => {
    const state = withGoal(1660).addFood(1, 'Banana-prata', 120);
    const low = withGoal(1660, 3, state);
    const high = withGoal(2290, 3, state);
    const banana = (p: Planner) =>
      p.meal(1).foods.find((food) => food.extraId !== null)!;
    expect(banana(high)).toEqual(banana(low));
    expect(banana(high).grams).toBe(120);
    expect(high.dayKcal() - banana(high).kcal).toBeGreaterThan(
      low.dayKcal() - banana(low).kcal,
    );
  });
});
