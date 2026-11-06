import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import type { DataSource } from 'typeorm';
import { OffProductEntity } from '../../entities/index.js';
import { type OffRow, offRow } from './parse.js';

/** Linhas por `INSERT` (13 colunas: bem abaixo do limite de parâmetros do Postgres). */
const BATCH = 2000;

/**
 * Importa o arquivo filtrado do Open Food Facts (`.jsonl.gz` ou `.jsonl`) para `off_products`, numa transação: a
 * tabela é trocada inteira (a busca de produtos espera até o fim). O índice trigram é refeito no fim, que é mais
 * rápido que mantê-lo a cada lote.
 */
export async function importOff(
  dataSource: DataSource,
  file: string,
  onProgress: (rows: number) => void = () => {},
) {
  let rows = 0;
  let skipped = 0;
  await dataSource.transaction(async (manager) => {
    await manager.query('TRUNCATE off_products');
    await manager.query('DROP INDEX IF EXISTS off_products_search_name');

    const insert = (batch: OffRow[]) =>
      manager
        .createQueryBuilder()
        .insert()
        .into(OffProductEntity)
        .values(batch)
        .orIgnore()
        .execute();

    const stream = createReadStream(file);
    const lines = createInterface({
      input: file.endsWith('.gz') ? stream.pipe(createGunzip()) : stream,
      crlfDelay: Infinity,
    });
    let batch: OffRow[] = [];
    for await (const line of lines) {
      if (!line.trim()) continue;
      let row: OffRow | null = null;
      try {
        row = offRow(JSON.parse(line));
      } catch {
        // Linha quebrada: conta como ignorada.
      }
      if (!row) {
        skipped++;
        continue;
      }
      batch.push(row);
      if (batch.length === BATCH) {
        await insert(batch);
        rows += batch.length;
        batch = [];
        if (rows % 100_000 === 0) onProgress(rows);
      }
    }
    if (batch.length) {
      await insert(batch);
      rows += batch.length;
    }

    await manager.query(
      'CREATE INDEX off_products_search_name ON off_products USING gin (search_name gin_trgm_ops)',
    );
  });
  await dataSource.query('ANALYZE off_products');
  return { rows, skipped };
}
