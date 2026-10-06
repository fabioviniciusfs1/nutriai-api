import { readFile } from 'node:fs/promises';
import { In, Not, type DataSource } from 'typeorm';
import { FoodEntity, TacoFoodEntity } from '../../entities/index.js';
import { seedCatalog } from '../../seed.js';
import { readOds } from '../ods.js';
import { parseTaco } from './parse.js';
import { TACO_SOURCE, tacoToCatalog } from './to-catalog.js';

/**
 * Importa a planilha da TACO: grava `taco_alimentos`, atualiza o catálogo do app (`foods` com
 * `source = 'taco'`) e refaz a semente (plano base, sugestões e nutrientes), tudo numa transação.
 */
export async function importTaco(dataSource: DataSource, file: string) {
  const { foods, warnings } = parseTaco(readOds(await readFile(file)));
  const catalog = foods.flatMap((food) => tacoToCatalog(food) ?? []);

  await dataSource.transaction(async (manager) => {
    await manager.upsert(TacoFoodEntity, foods, ['id']);
    await manager.delete(TacoFoodEntity, {
      id: Not(In(foods.map((food) => food.id))),
    });

    // Tira os alimentos da TACO que saíram da planilha ou mudaram de nome, antes de gravar os atuais.
    const current = new Set(
      catalog.map((food) => `${food.sourceId}|${food.name}`),
    );
    const existing = await manager.find(FoodEntity, {
      where: { source: TACO_SOURCE },
    });
    const stale = existing.filter(
      (food) => !current.has(`${food.sourceId}|${food.name}`),
    );
    if (stale.length > 0)
      await manager.delete(FoodEntity, {
        name: In(stale.map((food) => food.name)),
      });
    await manager.upsert(FoodEntity, catalog, ['name']);
  });

  await seedCatalog(dataSource);
  return { tacoFoods: foods.length, catalogFoods: catalog.length, warnings };
}
