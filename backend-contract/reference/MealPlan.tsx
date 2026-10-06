"use client";

import { useState } from "react";
import { ArrowLeftRight, Clock, Flame, Wheat, Drumstick, Droplet, Plus, PlusCircle, Trash2 } from "lucide-react";
import { mealAlternatives, mealPeriod, mealPlan } from "@/lib/mock-data";
import type { FoodFeedback } from "@/lib/food-feedback";
import { FoodFeedbackDialog } from "@/components/dashboard/FoodFeedbackDialog";
import { convertFood, resolveFoods, substituteOptions, usesRestrictedFood } from "@/lib/food-substitution";
import { TimePickerDialog } from "@/components/dashboard/TimePickerDialog";
import { RemoveMealDialog, type RemoveMealOption } from "@/components/dashboard/RemoveMealDialog";
import { CreateMealDialog, type CreateMealPreview } from "@/components/dashboard/CreateMealDialog";
import { AddFoodDialog, type AddFoodPreview } from "@/components/dashboard/AddFoodDialog";
import {
  EMPTY_DAY_PLAN,
  EMPTY_PLAN_CHANGES,
  savePlanChanges,
  type DayPlanChanges,
  type PlanChanges,
  markFoodEverywhere,
  markFoodInMeal,
  saveDayPlanChanges,
  saveMealTime,
  useAuth,
} from "@/lib/auth";

type Totals = { carbs: number; protein: number; fat: number; kcal: number };

function sumTotals(foods: Totals[]) {
  return foods.reduce(
    (totals, food) => ({
      carbs: totals.carbs + food.carbs,
      protein: totals.protein + food.protein,
      fat: totals.fat + food.fat,
      kcal: totals.kcal + food.kcal,
    }),
    { carbs: 0, protein: 0, fat: 0, kcal: 0 }
  );
}

/** Porção dos alimentos multiplicada por `factor` (gramas e nutrientes juntos). */
function scaleFoods<T extends Totals & { grams: number }>(foods: T[], factor: number): T[] {
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

/** Uma refeição do plano de hoje, com o que é preciso para recalcular a porção dela. */
type ScalableMeal = { id: number; totalsAt: (scale: number) => Totals };

/**
 * Multiplica as porções de `meals` por `factor` e, se os valores arredondados como o card mostra
 * passarem de `limitKcal`, aperta o fator até caber. Garante que o dia nunca passe do total anterior.
 */
function fitFactor(meals: ScalableMeal[], scales: Record<number, number>, factor: number, limitKcal: number) {
  const kcalAt = (f: number) => meals.reduce((sum, meal) => sum + meal.totalsAt((scales[meal.id] ?? 1) * f).kcal, 0);
  let fitted = factor;
  for (let i = 0; i < 200 && kcalAt(fitted) > limitKcal; i++) fitted *= 0.999;
  return fitted;
}

export function MealPlan() {
  const [time, setTime] = useState("Todos");
  const auth = useAuth();
  const savedTimes = auth?.mealTimes;
  // Marcações valem por alimento e até o usuário mudar. Remoções com "não fazer nada", refeições
  // criadas e alimentos acrescentados são permanentes; "sugerir" e "redistribuir" valem só hoje.
  const feedback = auth?.foodFeedback ?? {};
  const substitutes = auth?.foodSubstitutes ?? {};
  const planChanges = auth?.planChanges ?? EMPTY_PLAN_CHANGES;
  const dayPlan = auth?.dayPlan ?? EMPTY_DAY_PLAN;
  const { replacements } = dayPlan;
  const mealFoodSwaps = auth?.mealFoodSwaps ?? {};
  const [editingTime, setEditingTime] = useState<{ id: number; title: string; time: string } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [addingFoodTo, setAddingFoodTo] = useState<number | null>(null);

  const [pending, setPending] = useState<{
    mealId: number;
    mealTitle: string;
    foodName: string;
    kcal: number;
  } | null>(null);

  function confirmFeedback(reason: FoodFeedback, substitute: string | null) {
    if (!pending) return;
    // "Não quero" troca só nesta refeição; "Não gosto" e "Não tenho", em todas. As duas são permanentes.
    if (reason === "nao-quero") markFoodInMeal(pending.mealId, pending.foodName, substitute);
    else markFoodEverywhere(pending.foodName, reason, substitute);
    setPending(null);
  }

  const pendingOptions = pending ? substituteOptions(pending.foodName, pending.kcal, feedback) : [];

  /**
   * Plano com as mudanças permanentes `changes` e, se `day` vier, também com as de hoje. Cada
   * alimento acrescentado pelo usuário leva `extraIndex` (a posição dele em `extraFoods`).
   */
  function buildPlan(changes: PlanChanges, day?: DayPlanChanges) {
    const baseMeals = [
      ...mealPlan.map((meal) => ({ ...meal, time: savedTimes?.[meal.id] ?? meal.time, suggestion: "" })),
      ...changes.added,
    ];
    return baseMeals
      .filter((meal) => !changes.removed.includes(meal.id) && !day?.removed.includes(meal.id))
      .map((meal) => {
        const replacement = day?.replacements[meal.id];
        const scale = (changes.scales[meal.id] ?? 1) * (day?.scales[meal.id] ?? 1);
        // Alimentos marcados como "Não gosto / Não quero / Não tenho" já entram trocados pelo substituto.
        const swaps = { ...substitutes, ...mealFoodSwaps[meal.id] };
        const planFoods = resolveFoods(replacement?.foods ?? meal.foods, swaps).map((food) => ({
          ...food,
          extraIndex: null as number | null,
        }));
        const extras = (changes.extraFoods[meal.id] ?? []).flatMap((food, extraIndex) =>
          resolveFoods([food], swaps).map((resolved) => ({ ...resolved, extraIndex }))
        );
        const baseFoods = [...planFoods, ...extras];
        // Porções ajustadas: menores quando uma refeição ou alimento novo abriu espaço, maiores
        // quando receberam os nutrientes de uma refeição removida.
        const foods = scaleFoods(baseFoods, scale);
        return {
          ...meal,
          ...replacement,
          foods,
          totals: sumTotals(foods),
          /** Totais se a porção desta refeição passar a ser `nextScale` (usado nos avisos). */
          totalsAt: (nextScale: number) => sumTotals(scaleFoods(baseFoods, nextScale)),
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  // O que o usuário vê hoje, e o plano só com as mudanças permanentes (base para criar refeições e
  // acrescentar alimentos, que também são permanentes).
  const plan = buildPlan(planChanges, dayPlan);
  const permanentPlan = buildPlan(planChanges);
  const todayScales = Object.fromEntries(
    plan.map((meal) => [meal.id, (planChanges.scales[meal.id] ?? 1) * (dayPlan.scales[meal.id] ?? 1)])
  );

  const mealTimes = ["Todos", ...new Set(plan.map((meal) => meal.time))];
  // Se a refeição do filtro ativo foi removida, volta para "Todos".
  const activeTime = mealTimes.includes(time) ? time : "Todos";
  const meals = plan.filter((meal) => activeTime === "Todos" || meal.time === activeTime);

  const removingMeal = plan.find((meal) => meal.id === removing);
  const addingFoodMeal = plan.find((meal) => meal.id === addingFoodTo);
  const nextMeals = removingMeal ? plan.filter((meal) => meal.time > removingMeal.time) : [];
  const usedTitles = new Set([
    ...mealPlan.map((meal) => meal.title),
    ...Object.values(replacements).map((meal) => meal.title),
    ...planChanges.added.map((meal) => meal.suggestion),
  ]);
  // O assistente evita sugerir refeições com alimentos restritos (enquanto não forem liberados).
  const byRestriction = (a: (typeof mealAlternatives)[number], b: (typeof mealAlternatives)[number]) =>
    Number(usesRestrictedFood(a.foods, feedback)) - Number(usesRestrictedFood(b.foods, feedback));
  const availableAlternatives = mealAlternatives.filter((meal) => !usedTitles.has(meal.title)).sort(byRestriction);

  /**
   * Fator que todas as refeições do plano permanente recebem para abrir espaço para `kcal` novas
   * sem passar do total atual do dia: o total passa a ser `targetKcal`.
   */
  function shareFactor(meals: ReturnType<typeof buildPlan>, targetKcal: number) {
    const currentKcal = sumTotals(meals.map((meal) => meal.totals)).kcal;
    if (currentKcal === 0) return 1;
    return fitFactor(meals, planChanges.scales, targetKcal / currentKcal, targetKcal);
  }

  /** Previa de como ficam as refeições de hoje se as porções permanentes mudarem por `factor`. */
  function previewSources(factor: number) {
    return plan.map((meal) => ({
      title: meal.title,
      time: meal.time,
      before: meal.totals.kcal,
      after: meal.totalsAt(todayScales[meal.id] * factor).kcal,
    }));
  }

  /**
   * Planeja uma refeição nova sem mudar o total de calorias do dia (e sem passar da meta): ela fica
   * com no máximo a "parte justa" do dia (total ÷ nº de refeições) e todas as outras têm as porções
   * reduzidas na mesma proporção para abrir espaço. É o que o aviso de confirmação mostra.
   */
  function planNewMeal(title: string, mealTime: string) {
    // Prefere uma sugestão do mesmo período do dia que ainda não está no plano; se acabarem, repete.
    // (Com o backend, quem escolhe os alimentos é o assistente de IA, como no plano base.)
    const period = mealPeriod(mealTime);
    const inPeriod = (meal: (typeof mealAlternatives)[number]) => meal.periods.includes(period);
    const suggestion =
      availableAlternatives.find(inPeriod) ??
      [...mealAlternatives].sort(byRestriction).find(inPeriod) ??
      mealAlternatives[0];

    const dayKcal = sumTotals(permanentPlan.map((meal) => meal.totals)).kcal;
    const suggestedKcal = sumTotals(suggestion.foods).kcal;
    // Com o plano vazio não há de onde tirar: a sugestão entra com a porção original.
    const portion = dayKcal === 0 ? 1 : Math.min(1, dayKcal / (permanentPlan.length + 1) / suggestedKcal);
    const foods = scaleFoods(suggestion.foods, portion);
    const totals = sumTotals(foods);
    const othersFactor = shareFactor(permanentPlan, dayKcal - totals.kcal);

    return { title, time: mealTime, suggestion: suggestion.title, foods, totals, othersFactor };
  }

  function previewNewMeal(title: string, mealTime: string): CreateMealPreview {
    const { totals, othersFactor } = planNewMeal(title, mealTime);
    return {
      totals,
      reductionPercent: Math.round((1 - othersFactor) * 100),
      sources: previewSources(othersFactor),
    };
  }

  function scaleAll(factor: number) {
    const nextScales = { ...planChanges.scales };
    for (const meal of permanentPlan) nextScales[meal.id] = (planChanges.scales[meal.id] ?? 1) * factor;
    return nextScales;
  }

  function createMeal(title: string, mealTime: string) {
    const { suggestion, foods, othersFactor } = planNewMeal(title, mealTime);
    const id = Math.max(1000, ...planChanges.added.map((meal) => meal.id)) + 1;
    savePlanChanges({
      ...planChanges,
      scales: scaleAll(othersFactor),
      added: [...planChanges.added, { id, title, time: mealTime, suggestion, foods }],
    });
    setTime("Todos");
    setCreating(false);
  }

  /**
   * Alimento que o usuário quer comer: o assistente (simulado) escolhe a porção — a média dos
   * alimentos da refeição em kcal — e todas as refeições reduzem as porções na mesma proporção,
   * para o total do dia não aumentar.
   */
  function planFood(mealId: number, foodName: string): AddFoodPreview | null {
    const meal = permanentPlan.find((item) => item.id === mealId);
    if (!meal) return null;
    const dayKcal = sumTotals(permanentPlan.map((item) => item.totals)).kcal;
    const portionKcal = Math.round(meal.totals.kcal / (meal.foods.length + 1)) || 100;
    const food = convertFood(foodName, portionKcal);
    if (!food) return null;
    const factor = shareFactor(permanentPlan, dayKcal - food.kcal);
    return { food, reductionPercent: Math.round((1 - factor) * 100), factor };
  }

  function addFood(mealId: number, foodName: string) {
    const planned = planFood(mealId, foodName);
    if (!planned) return;
    const scales = scaleAll(planned.factor);
    // Guardado na porção "base" (fator 1) da refeição, para aparecer com as gramas sugeridas.
    const base = convertFood(planned.food.name, planned.food.kcal / (scales[mealId] ?? 1));
    if (base) {
      savePlanChanges({
        ...planChanges,
        scales,
        extraFoods: { ...planChanges.extraFoods, [mealId]: [...(planChanges.extraFoods[mealId] ?? []), base] },
      });
    }
    setAddingFoodTo(null);
  }

  /** Tira um alimento acrescentado; as calorias dele voltam para as refeições do dia. */
  function removeExtraFood(mealId: number, extraIndex: number) {
    const dayKcal = sumTotals(permanentPlan.map((meal) => meal.totals)).kcal;
    const extraFoods = {
      ...planChanges.extraFoods,
      [mealId]: (planChanges.extraFoods[mealId] ?? []).filter((_, index) => index !== extraIndex),
    };
    const nextPlan = buildPlan({ ...planChanges, extraFoods });
    const currentKcal = sumTotals(nextPlan.map((meal) => meal.totals)).kcal;
    const factor = currentKcal === 0 ? 1 : fitFactor(nextPlan, planChanges.scales, dayKcal / currentKcal, dayKcal);
    const scales = { ...planChanges.scales };
    for (const meal of nextPlan) scales[meal.id] = (planChanges.scales[meal.id] ?? 1) * factor;
    savePlanChanges({ ...planChanges, extraFoods, scales });
  }

  function changeMealTime(id: number, value: string) {
    // Refeições criadas guardam o horário junto delas; as do plano base, nos horários do usuário.
    if (planChanges.added.some((meal) => meal.id === id)) {
      savePlanChanges({
        ...planChanges,
        added: planChanges.added.map((meal) => (meal.id === id ? { ...meal, time: value } : meal)),
      });
    } else {
      saveMealTime(id, value);
    }
  }

  /**
   * "Redistribuir": as refeições seguintes aumentam as porções na mesma proporção para receber as
   * calorias da removida, sem passar do total que o dia tinha. Vale só para hoje.
   */
  function planRedistribution() {
    if (!removingMeal || nextMeals.length === 0) return { factor: 1, preview: [] };
    const nextKcal = nextMeals.reduce((sum, meal) => sum + meal.totals.kcal, 0);
    const limit = nextKcal + removingMeal.totals.kcal;
    const factor = nextKcal === 0 ? 1 : fitFactor(nextMeals, todayScales, limit / nextKcal, limit);
    return {
      factor,
      preview: nextMeals.map((meal) => ({
        title: meal.title,
        time: meal.time,
        before: meal.totals.kcal,
        after: meal.totalsAt(todayScales[meal.id] * factor).kcal,
      })),
    };
  }
  const redistribution = planRedistribution();

  function confirmRemoval(option: RemoveMealOption) {
    if (!removingMeal) return;
    const id = removingMeal.id;

    if (option === "suggest") {
      // Compara com a porção original: a sugestão herda o ajuste de porção desta refeição.
      const target = removingMeal.totalsAt(1).kcal;
      const [alternative] = [...availableAlternatives].sort(
        (a, b) =>
          byRestriction(a, b) ||
          Math.abs(sumTotals(a.foods).kcal - target) - Math.abs(sumTotals(b.foods).kcal - target)
      );
      if (alternative) {
        saveDayPlanChanges({ ...dayPlan, replacements: { ...replacements, [id]: alternative } });
      }
    } else if (option === "redistribute") {
      const scales = { ...dayPlan.scales };
      for (const meal of nextMeals) scales[meal.id] = (dayPlan.scales[meal.id] ?? 1) * redistribution.factor;
      saveDayPlanChanges({ ...dayPlan, removed: [...dayPlan.removed, id], scales });
    } else {
      // "Não fazer nada" é permanente: para voltar a ter a refeição, o usuário cria outra.
      const extraFoods = { ...planChanges.extraFoods };
      delete extraFoods[id];
      const isCreated = planChanges.added.some((meal) => meal.id === id);
      savePlanChanges({
        ...planChanges,
        extraFoods,
        added: planChanges.added.filter((meal) => meal.id !== id),
        removed: isCreated ? planChanges.removed : [...planChanges.removed, id],
      });
    }
    setRemoving(null);
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-neutral-900">Plano Alimentar</h3>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
        >
          <Plus size={16} /> Nova refeição
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {mealTimes.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTime(item)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTime === item
                ? "bg-accent text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <ul className="mt-4 flex flex-col gap-4">
        {meals.map((meal) => {
          const { totals } = meal;

          return (
            <li key={meal.id} className="rounded-xl border border-neutral-100 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-neutral-900">{meal.title}</p>
                <button
                  type="button"
                  title="Alterar horário da refeição"
                  aria-label={`Horário da refeição: ${meal.title}, ${meal.time}. Alterar`}
                  onClick={() => setEditingTime({ id: meal.id, title: meal.title, time: meal.time })}
                  className="flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-200"
                >
                  <Clock size={12} /> {meal.time}
                </button>
                <button
                  type="button"
                  title="Adicionar alimento"
                  aria-label={`Adicionar alimento: ${meal.title}`}
                  onClick={() => setAddingFoodTo(meal.id)}
                  className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-green-50 hover:text-green-600"
                >
                  <PlusCircle size={16} />
                </button>
                <button
                  type="button"
                  title="Remover refeição"
                  aria-label={`Remover refeição: ${meal.title}`}
                  onClick={() => setRemoving(meal.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                <span className="flex items-center gap-1">
                  <Flame size={14} /> {totals.kcal} kcal
                </span>
                <span className="flex items-center gap-1">
                  <Wheat size={14} /> {totals.carbs}g carboidratos
                </span>
                <span className="flex items-center gap-1">
                  <Drumstick size={14} /> {totals.protein}g proteína
                </span>
                <span className="flex items-center gap-1">
                  <Droplet size={14} /> {totals.fat}g gorduras
                </span>
              </div>

              <div className="mt-4">
                <div className="hidden sm:grid-cols-[2fr_1fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] gap-2 border-b border-neutral-100 pb-2 text-xs font-medium text-neutral-400 sm:grid">
                  <span>Alimento</span>
                  <span>Quantidade</span>
                  <span>Carb.</span>
                  <span>Prot.</span>
                  <span>Gord.</span>
                  <span>Kcal</span>
                  <span className="w-[3.75rem]" aria-hidden />
                </div>
                {meal.foods.map((food, index) => {
                  const { extraIndex } = food;
                  return (
                    <div
                      // Com substituições, o mesmo alimento pode aparecer duas vezes na refeição.
                      key={`${index}-${food.name}`}
                      className="grid grid-cols-4 gap-x-2 gap-y-2 border-b border-neutral-100 py-3 text-sm text-neutral-700 last:border-b-0 sm:grid-cols-[2fr_1fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] sm:items-center sm:border-neutral-50 sm:py-2"
                    >
                      <span className="col-span-3 font-medium text-neutral-900 sm:col-span-1 sm:font-normal sm:text-neutral-700">
                        {food.name}
                      </span>
                      <span className="text-right text-neutral-500 sm:text-left">{food.grams} g</span>
                      <span className="flex flex-col sm:block">
                        <span className="text-xs text-neutral-400 sm:hidden">Carb.</span>
                        {food.carbs}g
                      </span>
                      <span className="flex flex-col sm:block">
                        <span className="text-xs text-neutral-400 sm:hidden">Prot.</span>
                        {food.protein}g
                      </span>
                      <span className="flex flex-col sm:block">
                        <span className="text-xs text-neutral-400 sm:hidden">Gord.</span>
                        {food.fat}g
                      </span>
                      <span className="flex flex-col sm:block">
                        <span className="text-xs text-neutral-400 sm:hidden">Kcal</span>
                        {food.kcal}
                      </span>
                      <div className="col-span-4 flex items-center gap-1 sm:col-span-1 sm:w-[3.75rem]">
                        <button
                          type="button"
                          title="Substituir alimento"
                          aria-label={`Substituir alimento: ${food.name}`}
                          onClick={() =>
                            setPending({ mealId: meal.id, mealTitle: meal.title, foodName: food.name, kcal: food.kcal })
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <ArrowLeftRight size={15} />
                        </button>
                        {extraIndex !== null && (
                          <button
                            type="button"
                            title="Remover alimento"
                            aria-label={`Remover alimento: ${food.name}`}
                            onClick={() => removeExtraFood(meal.id, extraIndex)}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <TimePickerDialog
        open={editingTime !== null}
        title={`Horário: ${editingTime?.title ?? ""}`}
        value={editingTime?.time ?? "00:00"}
        onConfirm={(value) => {
          if (editingTime) {
            changeMealTime(editingTime.id, value);
            // O filtro ativo segue a refeição para o novo horário.
            if (time === editingTime.time) setTime(value);
          }
          setEditingTime(null);
        }}
        onCancel={() => setEditingTime(null)}
      />

      <CreateMealDialog
        open={creating}
        preview={previewNewMeal}
        onConfirm={createMeal}
        onCancel={() => setCreating(false)}
      />

      <RemoveMealDialog
        open={removingMeal !== undefined}
        mealTitle={removingMeal?.title ?? ""}
        mealKcal={removingMeal?.totals.kcal ?? 0}
        redistribution={redistribution.preview}
        canSuggest={availableAlternatives.length > 0}
        onConfirm={confirmRemoval}
        onCancel={() => setRemoving(null)}
      />

      <AddFoodDialog
        open={addingFoodMeal !== undefined}
        mealTitle={addingFoodMeal?.title ?? ""}
        feedback={feedback}
        preview={(foodName) => (addingFoodMeal ? planFood(addingFoodMeal.id, foodName) : null)}
        onConfirm={(foodName) => addingFoodMeal && addFood(addingFoodMeal.id, foodName)}
        onCancel={() => setAddingFoodTo(null)}
      />

      <FoodFeedbackDialog
        open={pending !== null}
        foodName={pending?.foodName ?? ""}
        mealTitle={pending?.mealTitle ?? ""}
        options={pendingOptions}
        onConfirm={confirmFeedback}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
