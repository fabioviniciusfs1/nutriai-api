import {
  testBaseMeals as baseMeals,
  testCatalog as catalog,
  testFoods as foodCatalog,
} from './test-catalog.js';
import { FoodCatalog, similarity } from './foods.js';
import { goalFactor, Planner, PlanRuleError } from './planner.js';
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
    expect(kcalOf(p)).toEqual([350, 375, 435]);
    expect(p.plan[0].foods.every((food) => food.extraId === null)).toBe(true);
  });

  it('usa o horário escolhido e reordena', () => {
    const state = planner().changeMealTime(1, '21:00');
    expect(planner(state).plan.map((meal) => meal.id)).toEqual([2, 3, 1]);
  });

  describe('acrescentar alimento', () => {
    it('busca sem diferenciar acentos e calcula a porção e a redução', () => {
      const result = planner().searchFoods(1, 'pao integral');
      expect(result.found).toBe(true);
      expect(result.options.map((option) => option.food.name)).toEqual([
        'Pão integral',
      ]);
      // kcal da refeição ÷ (nº de alimentos + 1) = 350 / 5 = 70.
      expect(result.options[0].food.kcal).toBe(70);
      expect(result.options[0].reductionPercent).toBeGreaterThan(0);
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

    it('acrescenta sem aumentar o dia e remove devolvendo as calorias', () => {
      const before = planner();
      const added = planner(before.addFood(1, 'Banana-prata'));
      expect(added.dayKcal()).toBeLessThanOrEqual(before.dayKcal());

      const extra = added.meal(1).foods.find((food) => food.extraId !== null)!;
      expect(extra).toMatchObject({ name: 'Banana-prata', extraId: 'x-1' });
      expect(added.state.nextExtraId).toBe(2);

      const removed = planner(added.removeExtraFood(1, 'x-1'));
      expect(removed.meal(1).foods.some((food) => food.extraId !== null)).toBe(
        false,
      );
      expect(removed.dayKcal()).toBeLessThanOrEqual(added.dayKcal());
      expect(removed.dayKcal()).toBeGreaterThan(
        added.dayKcal() - extra.kcal - 10,
      );
    });

    it('recusa alimento restrito ou desconhecido', () => {
      const state = planner().swapFood(2, 'Guacamole', 'nao-gosto', null);
      expect(() => planner(state).addFood(1, 'Guacamole')).toThrow(
        PlanRuleError,
      );
      expect(() => planner().addFood(1, 'Pizza')).toThrow(
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
    expect(kcalOf(withGoal(null))).toEqual([350, 375, 435]);
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

  it('acrescentar e remover alimento não aumentam o dia', () => {
    const start = withGoal(2290);
    const search = start.searchFoods(1, 'banana');
    const added = withGoal(2290, 3, start.addFood(1, 'Banana-prata'));
    const banana = added.meal(1).foods.find((food) => food.extraId !== null)!;
    // Aparece com a porção da busca (na escala da meta).
    expect(
      Math.abs(banana.kcal - search.options[0].food.kcal),
    ).toBeLessThanOrEqual(2);
    expect(added.dayKcal()).toBeLessThanOrEqual(start.dayKcal());

    const removed = withGoal(2290, 3, added.removeExtraFood(1, 'x-1'));
    expect(removed.dayKcal()).toBeLessThanOrEqual(added.dayKcal());
  });

  it('mudar a meta escala o plano todo, inclusive o que o usuário acrescentou', () => {
    const state = withGoal(1660).addFood(1, 'Banana-prata');
    const low = withGoal(1660, 3, state);
    const high = withGoal(2290, 3, state);
    const banana = (p: Planner) =>
      p.meal(1).foods.find((food) => food.extraId !== null)!.kcal;
    expect(high.dayKcal() / low.dayKcal()).toBeCloseTo(2290 / 1660, 1);
    expect(banana(high) / banana(low)).toBeCloseTo(2290 / 1660, 1);
  });
});
