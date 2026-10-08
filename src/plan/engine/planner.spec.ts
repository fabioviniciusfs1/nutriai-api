import {
  testBaseMeals as baseMeals,
  testCatalog as catalog,
  testFoods as foodCatalog,
  testSuggestions as mealAlternatives,
} from './test-catalog.js';
import { FoodCatalog, similarity } from './foods.js';
import { goalFactor, mealPeriod, Planner, PlanRuleError } from './planner.js';
import {
  EMPTY_DAY_PLAN,
  EMPTY_PLAN_CHANGES,
  type PlannerOptions,
  type PlanState,
} from './types.js';

const EMPTY_STATE: PlanState = {
  mealTimes: {},
  planChanges: EMPTY_PLAN_CHANGES,
  dayPlan: EMPTY_DAY_PLAN,
  foodFeedback: {},
  foodSubstitutes: {},
  mealFoodSwaps: {},
  nextExtraId: 1,
};

const planner = (state: PlanState = EMPTY_STATE) => new Planner(catalog, state);
const kcalOf = (p: Planner) => p.plan.map((meal) => meal.totals.kcal);

describe('catálogo de teste', () => {
  it('tem todo alimento do plano base e das sugestões', () => {
    const foods = new FoodCatalog(foodCatalog);
    const missing = [...baseMeals, ...mealAlternatives]
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
    expect(p.todayPlan().canCreateMeal).toBe(true);
  });

  it('usa o horário escolhido e reordena', () => {
    const state = planner().changeMealTime(1, '21:00');
    expect(planner(state).plan.map((meal) => meal.id)).toEqual([2, 3, 1]);
  });

  describe('criar refeição', () => {
    it('não muda o total do dia e reduz as outras na mesma proporção', () => {
      const before = planner();
      const preview = before.previewNewMeal('Lanche', '16:00');
      const after = planner(before.createMeal('Lanche', '16:00'));

      expect(after.dayKcal()).toBeLessThanOrEqual(before.dayKcal());
      expect(preview.dayKcal).toBe(after.dayKcal());
      expect(preview.reductionPercent).toBeGreaterThan(0);
      expect(preview.changes.map((change) => change.mealId)).toEqual([1, 2, 3]);

      const created = after.plan.find((meal) => meal.title === 'Lanche')!;
      expect(created.id).toBe(1001);
      expect(created.totals).toEqual(preview.totals);
      // No máximo a "parte justa" do dia: total ÷ (3 refeições + 1).
      expect(created.totals.kcal).toBeLessThanOrEqual(before.dayKcal() / 4 + 4);
      for (const change of preview.changes) {
        expect(
          after.plan.find((meal) => meal.id === change.mealId)!.totals.kcal,
        ).toBe(change.after);
      }
    });

    it('escolhe uma sugestão do período do horário', () => {
      const state = planner().createMeal('Ceia', '22:00');
      const added = state.planChanges.added[0];
      const suggestion = mealAlternatives.find(
        (meal) => meal.title === added.suggestion,
      )!;
      expect(suggestion.periods).toContain(mealPeriod('22:00'));
    });

    it('com o plano vazio, entra com a porção original', () => {
      let state = EMPTY_STATE;
      for (const id of [1, 2, 3])
        state = planner(state).confirmRemoval(id, 'nothing');
      const after = planner(planner(state).createMeal('Almoço', '12:00'));
      const suggestion = mealAlternatives.find(
        (meal) => meal.title === after.state.planChanges.added[0].suggestion,
      )!;
      expect(after.plan[0].foods.map((food) => food.grams)).toEqual(
        suggestion.foods.map((food) => food.grams),
      );
    });
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

  describe('remover refeição', () => {
    it('redistribuir aumenta só as seguintes, sem passar do total do dia', () => {
      const before = planner();
      const options = before.removalOptions(1);
      expect(options.redistribution.map((change) => change.mealId)).toEqual([
        2, 3,
      ]);

      const after = planner(before.confirmRemoval(1, 'redistribute'));
      expect(after.plan.map((meal) => meal.id)).toEqual([2, 3]);
      expect(after.dayKcal()).toBeLessThanOrEqual(before.dayKcal());
      expect(after.dayKcal()).toBeGreaterThan(before.dayKcal() - 10);
      expect(kcalOf(after)).toEqual(
        options.redistribution.map((change) => change.after),
      );
      // Só de hoje: o plano permanente não muda.
      expect(after.state.planChanges).toEqual(EMPTY_PLAN_CHANGES);
    });

    it('não redistribui a última refeição', () => {
      expect(planner().removalOptions(3).redistribution).toEqual([]);
      expect(() => planner().confirmRemoval(3, 'redistribute')).toThrow(
        PlanRuleError,
      );
    });

    it('sugerir troca pela sugestão de calorias mais próximas, mesmo id e horário', () => {
      const before = planner();
      const options = before.removalOptions(2);
      const after = planner(before.confirmRemoval(2, 'suggest'));
      const meal = after.meal(2);
      expect(meal.title).toBe(options.suggestion!.title);
      expect(meal.totals.kcal).toBe(options.suggestion!.kcal);
      expect(meal.time).toBe('12:30');
      expect(after.state.dayPlan.replacements[2].title).toBe(meal.title);
    });

    it('não fazer nada é permanente e apaga a refeição criada', () => {
      const removedBase = planner().confirmRemoval(1, 'nothing');
      expect(removedBase.planChanges.removed).toEqual([1]);

      const created = planner(planner().createMeal('Lanche', '16:00'));
      const withExtra = planner(created.addFood(1001, 'Banana-prata'));
      const state = withExtra.confirmRemoval(1001, 'nothing');
      expect(state.planChanges.added).toEqual([]);
      expect(state.planChanges.removed).toEqual([]);
      expect(state.planChanges.extraFoods[1001]).toBeUndefined();
    });

    it('refeição inexistente', () => {
      expect(() => planner().removalOptions(99)).toThrow(
        'Refeição não encontrada.',
      );
    });
  });

  describe('trocas', () => {
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

    it('sugestões evitam alimentos restritos', () => {
      const state = planner().swapFood(1, 'Ovo poché', 'nao-gosto', null);
      const alternatives = planner(state).availableAlternatives();
      const restrictedIndex = alternatives.findIndex((meal) =>
        meal.foods.some((food) => food.name === 'Ovo poché'),
      );
      const freeIndex = alternatives.findIndex(
        (meal) => !meal.foods.some((food) => food.name === 'Ovo poché'),
      );
      if (restrictedIndex >= 0) expect(freeIndex).toBeLessThan(restrictedIndex);
    });
  });
});

describe('meta calórica e refeições por dia', () => {
  const withGoal = (
    calorieGoal: number | null,
    mealsPerDay = 3,
    state: PlanState = EMPTY_STATE,
  ) =>
    new Planner(catalog, state, {
      calorieGoal,
      mealsPerDay,
    } satisfies PlannerOptions);

  it('o plano inicial tem as refeições do perfil', () => {
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

  it('acrescentar, remover alimento e redistribuir não aumentam o dia', () => {
    const start = withGoal(2290);
    // Criar refeição leva o dia para a meta (sem passar dela).
    const created = withGoal(2290, 3, start.createMeal('Lanche', '16:00'));
    expect(created.dayKcal()).toBeLessThanOrEqual(2290);
    expect(created.dayKcal()).toBeGreaterThan(2290 - 15);

    const search = created.searchFoods(1, 'banana');
    const added = withGoal(2290, 3, created.addFood(1, 'Banana-prata'));
    const banana = added.meal(1).foods.find((food) => food.extraId !== null)!;
    // Aparece com a porção da busca (na escala da meta).
    expect(
      Math.abs(banana.kcal - search.options[0].food.kcal),
    ).toBeLessThanOrEqual(2);
    expect(added.dayKcal()).toBeLessThanOrEqual(created.dayKcal());

    const removed = withGoal(2290, 3, added.removeExtraFood(1, 'x-1'));
    expect(removed.dayKcal()).toBeLessThanOrEqual(added.dayKcal());

    const redistributed = withGoal(
      2290,
      3,
      start.confirmRemoval(1, 'redistribute'),
    );
    expect(redistributed.dayKcal()).toBeLessThanOrEqual(start.dayKcal());
    expect(redistributed.dayKcal()).toBeGreaterThan(start.dayKcal() - 15);
  });

  it('a prévia de criar refeição bate com o resultado', () => {
    const start = withGoal(2290);
    const preview = start.previewNewMeal('Lanche', '16:00');
    const after = withGoal(2290, 3, start.createMeal('Lanche', '16:00'));
    expect(preview.dayKcal).toBe(after.dayKcal());
    expect(after.plan.find((meal) => meal.id === 1001)!.totals.kcal).toBe(
      preview.totals.kcal,
    );
  });

  it('sugerir uma nova compara com a porção original da refeição', () => {
    // Com ou sem meta, a escolha é a mesma (a meta só muda o tamanho das porções).
    const withTarget = withGoal(2290).removalOptions(2).suggestion!;
    const without = withGoal(null).removalOptions(2).suggestion!;
    expect(withTarget.title).toBe(without.title);
    expect(withTarget.kcal).toBeGreaterThan(without.kcal);
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

  it('apagar tudo e criar 3 refeições volta para a meta', () => {
    let state = EMPTY_STATE;
    for (const id of [1, 2, 3])
      state = withGoal(2290, 3, state).confirmRemoval(id, 'nothing');
    expect(withGoal(2290, 3, state).dayKcal()).toBe(0);

    const first = withGoal(2290, 3, state).previewNewMeal('Café', '07:00');
    expect(first.changes).toEqual([]);
    expect(Math.abs(first.totals.kcal - 2290)).toBeLessThanOrEqual(25);

    state = withGoal(2290, 3, state).createMeal('Café', '07:00');
    state = withGoal(2290, 3, state).createMeal('Almoço', '12:00');
    state = withGoal(2290, 3, state).createMeal('Jantar', '19:00');
    const p = withGoal(2290, 3, state);
    expect(p.plan).toHaveLength(3);
    expect(p.dayKcal()).toBeLessThanOrEqual(2290);
    expect(p.dayKcal()).toBeGreaterThan(2290 - 25);
    for (const meal of p.plan)
      expect(Math.abs(meal.totals.kcal - 2290 / 3)).toBeLessThan(60);
  });

  it('com o dia abaixo da meta, criar refeição aumenta as outras', () => {
    const state = withGoal(2290).confirmRemoval(3, 'nothing');
    const preview = withGoal(2290, 3, state).previewNewMeal('Ceia', '21:00');
    expect(preview.reductionPercent).toBeLessThan(0);
    expect(
      preview.changes.every((change) => change.after > change.before),
    ).toBe(true);
    expect(preview.dayKcal).toBeGreaterThan(2290 - 25);
  });

  it('sem meta, criar refeição continua conservando o total', () => {
    const start = withGoal(null);
    const after = withGoal(null, 3, start.createMeal('Lanche', '16:00'));
    expect(after.dayKcal()).toBeLessThanOrEqual(start.dayKcal());
    expect(after.dayKcal()).toBeGreaterThan(start.dayKcal() - 15);
  });

  it('usa a refeição composta pelo assistente e escala para a meta', () => {
    const composed = {
      title: 'Omelete de Espinafre',
      periods: ['noite' as const],
      foods: [
        { name: 'Ovos', grams: 100, carbs: 1, protein: 13, fat: 10, kcal: 143 },
        {
          name: 'Espinafre refogado',
          grams: 100,
          carbs: 4,
          protein: 2,
          fat: 0,
          kcal: 30,
        },
      ],
    };
    const start = withGoal(2290);
    const preview = start.previewNewMeal('Jantar leve', '21:00', composed);
    expect(preview.suggestion).toBe('Omelete de Espinafre');
    expect(preview.foods.map((food) => food.name)).toEqual([
      'Ovos',
      'Espinafre refogado',
    ]);
    expect(preview.foods.reduce((sum, food) => sum + food.kcal, 0)).toBe(
      preview.totals.kcal,
    );
    // Parte justa da meta: 2290 / 4 refeições.
    expect(Math.abs(preview.totals.kcal - 2290 / 4)).toBeLessThan(15);

    const after = withGoal(
      2290,
      3,
      start.createMeal('Jantar leve', '21:00', composed),
    );
    const created = after.plan.find((meal) => meal.id === 1001)!;
    expect(created.title).toBe('Jantar leve');
    expect(created.foods.map((food) => food.grams)).toEqual(
      preview.foods.map((food) => food.grams),
    );
    expect(after.state.planChanges.added[0].suggestion).toBe(
      'Omelete de Espinafre',
    );
  });

  it('metas da refeição nova: kcal e o que falta de cada macro', () => {
    const targets = withGoal(2290).newMealTargets({
      protein: 178,
      fat: 89,
      carbs: 194,
    });
    expect(targets.kcal).toBe(Math.round(2290 / 4));
    expect(targets.macros!.protein).toBeGreaterThan(0);
    expect(withGoal(null).newMealTargets(null)).toEqual({
      kcal: Math.round(1160 / 4),
      macros: null,
    });
  });

  it('com o assistente, sempre dá para criar refeição', () => {
    let state = EMPTY_STATE;
    for (const suggestion of mealAlternatives) {
      state = withGoal(null, 3, state).createMeal(
        suggestion.title,
        '12:00',
        suggestion,
      );
    }
    expect(withGoal(null, 3, state).todayPlan().canCreateMeal).toBe(false);
    expect(
      new Planner(catalog, state, {
        calorieGoal: null,
        mealsPerDay: 3,
        composerAvailable: true,
      }).todayPlan().canCreateMeal,
    ).toBe(true);
  });
});
