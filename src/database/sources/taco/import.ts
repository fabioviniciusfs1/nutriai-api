import { readFile } from 'node:fs/promises';
import { In, Not, type DataSource } from 'typeorm';
import { TacoFoodEntity } from '../../entities/index.js';
import { seedCatalog } from '../../seed.js';
import { upsertCatalog } from '../catalog-food.js';
import { readOds } from '../ods.js';
import { parseTaco } from './parse.js';
import { TACO_SOURCE, tacoToCatalog } from './to-catalog.js';

/**
 * Importa a planilha da TACO: grava `taco_alimentos`, atualiza o catálogo do app (`foods` com
 * `source = 'taco'`) e refaz a semente (plano base e nutrientes), tudo numa transação.
 */
export async function importTaco(dataSource: DataSource, file: string) {
  const { foods, warnings } = parseTaco(readOds(await readFile(file)));
  const catalog = foods.flatMap((food) => tacoToCatalog(food) ?? []);

  await dataSource.transaction(async (manager) => {
    await manager.upsert(TacoFoodEntity, foods, ['id']);
    await manager.delete(TacoFoodEntity, {
      id: Not(In(foods.map((food) => food.id))),
    });
    await upsertCatalog(manager, TACO_SOURCE, catalog);
  });

  await seedCatalog(dataSource);
  return { tacoFoods: foods.length, catalogFoods: catalog.length, warnings };
}
