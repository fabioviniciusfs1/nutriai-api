"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { foodCatalog } from "@/lib/mock-data";
import { FOOD_FEEDBACK, type FoodFeedback } from "@/lib/food-feedback";
import type { PlanFood } from "@/lib/food-substitution";

/** O que acontece no plano se o alimento for acrescentado — mostrado antes de confirmar. */
export type AddFoodPreview = {
  /** O alimento na porção escolhida pelo assistente. */
  food: PlanFood;
  /** Quanto as porções das refeições diminuem (%). */
  reductionPercent: number;
  factor: number;
};

type AddFoodDialogProps = {
  open: boolean;
  mealTitle: string;
  /** Alimentos restritos ("Não gosto / Não quero / Não tenho") não podem ser acrescentados. */
  feedback: Record<string, FoodFeedback>;
  preview: (foodName: string) => AddFoodPreview | null;
  onConfirm: (foodName: string) => void;
  onCancel: () => void;
};

/** Quantas sugestões mostrar quando o alimento não está na base. */
const MAX_SUGGESTIONS = 5;

/** Compara nomes sem diferenciar maiúsculas nem acentos ("feijao" encontra "Feijão"). */
function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

function bigrams(text: string) {
  const letters = normalize(text).replace(/[^a-z0-9]/g, "");
  return Array.from({ length: Math.max(0, letters.length - 1) }, (_, i) => letters.slice(i, i + 2));
}

/** Semelhança entre 0 e 1 pelos pares de letras em comum ("banan" ≈ "Banana-prata"). */
function similarity(a: string, b: string) {
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

type SearchResult = {
  query: string;
  /** Se o texto bateu com alimentos da base; senão, `options` são sugestões parecidas. */
  found: boolean;
  /** Marcação do alimento digitado, se ele existe mas está restrito. */
  restricted: { name: string; label: string } | null;
  options: PlanFood[];
};

export function AddFoodDialog({ open, mealTitle, feedback, preview, onConfirm, onCancel }: AddFoodDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [choice, setChoice] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName("");
      setResult(null);
      setChoice(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function search() {
    // Com o backend, o assistente de IA reconhece o alimento; aqui a busca é no catálogo.
    const query = normalize(name);
    const allowed = foodCatalog.filter((food) => !feedback[food.name]);
    const matches = allowed.filter((food) => normalize(food.name).includes(query));
    const exactRestricted = foodCatalog.find((food) => normalize(food.name) === query && feedback[food.name]);
    const candidates =
      matches.length > 0
        ? matches
        : [...allowed]
            .map((food) => ({ food, score: similarity(query, food.name) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_SUGGESTIONS)
            .map(({ food }) => food);

    setResult({
      query: name.trim(),
      found: matches.length > 0,
      restricted: exactRestricted
        ? {
            name: exactRestricted.name,
            label: FOOD_FEEDBACK.find((item) => item.id === feedback[exactRestricted.name])?.label ?? "",
          }
        : null,
      options: candidates.flatMap((food) => preview(food.name)?.food ?? []),
    });
    setChoice(matches.length === 1 ? matches[0].name : null);
  }

  // A redução das porções depende do alimento escolhido (a porção dele muda as contas).
  const chosen = choice ? preview(choice) : null;
  // O botão principal busca; depois da busca vira "Confirmar", até o texto mudar de novo.
  const searched = result !== null && normalize(name) === normalize(result.query);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <form
        className="p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (searched) {
            if (chosen) onConfirm(chosen.food.name);
          } else if (name.trim()) {
            search();
          }
        }}
      >
        <h4 className="font-semibold text-neutral-900">Adicionar alimento</h4>
        <p className="mt-1 text-sm text-neutral-600">
          Diga o que você quer comer em &ldquo;{mealTitle}&rdquo;. O assistente ajusta a quantidade à sua meta
          diária.
        </p>

        <label className="sr-only" htmlFor="add-food-name">
          Alimento
        </label>
        <input
          id="add-food-name"
          type="text"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Banana"
          className="mt-4 w-full rounded-xl bg-neutral-50 px-4 py-2.5 text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-accent"
        />

        {result && (
          <>
            <p className="mt-4 text-sm text-neutral-600">
              {result.restricted
                ? `Você marcou ${result.restricted.name} como “${result.restricted.label}” (libere na página Alimentos para usá-lo). `
                : ""}
              {result.found
                ? "Escolha o alimento, na porção sugerida pelo assistente:"
                : result.restricted
                  ? "Sugestões parecidas:"
                  : `Não encontramos “${result.query}” na base de dados. Sugestões parecidas:`}
            </p>

            {result.options.length > 0 ? (
              <fieldset className="mt-3 flex min-w-0 flex-col gap-2">
                <legend className="sr-only">Alimento</legend>
                {result.options.map((option) => (
                  <label
                    key={option.name}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                      choice === option.name ? "border-accent bg-accent/5" : "border-neutral-200 hover:bg-neutral-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="add-food-option"
                      value={option.name}
                      checked={choice === option.name}
                      onChange={() => setChoice(option.name)}
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-neutral-900">{option.name}</span>
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        {option.carbs}g carb. · {option.protein}g prot. · {option.fat}g gord.
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums text-neutral-500">
                      <span className="block font-medium text-neutral-800">{option.grams} g</span>
                      {option.kcal} kcal
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <p className="mt-3 text-sm text-neutral-500">Nenhum alimento disponível.</p>
            )}

            {chosen && (
              <p className="mt-3 text-xs text-neutral-500">
                Para não passar da meta diária, as porções das refeições serão reduzidas em{" "}
                {chosen.reductionPercent}%. O alimento fica na refeição até você removê-lo; aí as calorias dele
                voltam para as outras.
              </p>
            )}
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            Cancelar
          </button>
          {searched ? (
            <button
              type="submit"
              disabled={!chosen}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirmar
            </button>
          ) : (
            <button
              type="submit"
              disabled={name.trim() === ""}
              className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Search size={16} /> Buscar
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
