import { In, Not, type EntityManager } from 'typeorm';
import type { FoodGroup, Totals } from '../../contract.js';
import type { AnimalTag } from '../../plan/engine/diet.js';
import { FoodEntity } from '../entities/index.js';

/**
 * Alimento como entra no catálogo do app (tabela `foods`), vindo de uma fonte (TACO, TBCA).
 * Cada fonte tem a sua tabela com os dados originais e um mapeador para este formato.
 */
export type CatalogSourceFood = {
  name: string;
  /** `null` = sem grupo: aparece na busca, mas não tem substitutos. */
  group: FoodGroup | null;
  per100g: Totals;
  /** Origens animais (carne, pescado, ovo, leite, mel), para o tipo de alimentação. */
  animal: AnimalTag[];
  /** Nutrientes acompanhados por 100 g (id em `nutrient_defs` → valor). */
  microsPer100g: Record<string, number>;
  source: string;
  sourceId: string;
};

/**
 * Grava no catálogo os alimentos de uma fonte e tira os dela que saíram ou mudaram de nome. O nome é a chave
 * do catálogo: repetido na lista, fica o primeiro; já usado por outra fonte, fica o da outra se
 * `yieldToOthers` (a TBCA cede para a TACO, que tem os nomes do plano base), senão passa a ser desta.
 * Devolve os nomes que ficaram de fora.
 */
export async function upsertCatalog(
  manager: EntityManager,
  source: string,
  foods: CatalogSourceFood[],
  yieldToOthers = false,
): Promise<string[]> {
  const taken = yieldToOthers
    ? new Set(
        (
          await manager.find(FoodEntity, {
            select: { name: true },
            where: { source: Not(source) },
          })
        ).map((food) => food.name),
      )
    : new Set<string>();
  const skipped: string[] = [];
  const catalog = new Map<string, CatalogSourceFood>();
  for (const food of foods) {
    if (catalog.has(food.name) || taken.has(food.name)) skipped.push(food.name);
    else catalog.set(food.name, food);
  }

  const current = new Set(
    [...catalog.values()].map((food) => `${food.sourceId}|${food.name}`),
  );
  const existing = await manager.find(FoodEntity, { where: { source } });
  const stale = existing.filter(
    (food) => !current.has(`${food.sourceId}|${food.name}`),
  );
  if (stale.length > 0)
    await manager.delete(FoodEntity, {
      source,
      name: In(stale.map((food) => food.name)),
    });
  // Em blocos: o Postgres limita os parâmetros de uma consulta.
  const rows = [...catalog.values()];
  for (let index = 0; index < rows.length; index += 1000)
    await manager.upsert(FoodEntity, rows.slice(index, index + 1000), ['name']);
  return skipped;
}
