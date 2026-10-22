import { readFile } from 'node:fs/promises';
import { In, Not, type DataSource } from 'typeorm';
import { TbcaFoodEntity } from '../../entities/index.js';
import { seedCatalog } from '../../seed.js';
import { upsertCatalog } from '../catalog-food.js';
import { parseTbca } from './parse.js';
import { TBCA_SOURCE, tbcaToCatalog } from './to-catalog.js';

/**
 * Importa o CSV da TBCA: grava `tbca_alimentos` e atualiza o catálogo do app (`foods` com
 * `source = 'tbca'`), numa transação, e refaz a semente. Nomes já usados pela TACO ou repetidos na TBCA
 * ficam fora do catálogo (avisados em `warnings`).
 */
export async function importTbca(dataSource: DataSource, file: string) {
  const { foods, warnings } = parseTbca(await readFile(file, 'utf8'));
  const catalog = foods.flatMap((food) => tbcaToCatalog(food) ?? []);

  const skipped = await dataSource.transaction(async (manager) => {
    for (let index = 0; index < foods.length; index += 500)
      await manager.upsert(TbcaFoodEntity, foods.slice(index, index + 500), [
        'id',
      ]);
    await manager.delete(TbcaFoodEntity, {
      id: Not(In(foods.map((food) => food.id))),
    });
    return upsertCatalog(manager, TBCA_SOURCE, catalog, true);
  });

  await seedCatalog(dataSource);
  return {
    tbcaFoods: foods.length,
    catalogFoods: catalog.length - skipped.length,
    warnings: [
      ...warnings,
      ...skipped.map(
        (name) => `"${name}": nome já existe no catálogo, fora do catálogo.`,
      ),
    ],
  };
}
