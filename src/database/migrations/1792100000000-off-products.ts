import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Produtos industrializados do Open Food Facts (`npm run db:import-off`), achados pelo código de barras ou pelo
 * nome no "Adicionar alimento extra". A busca por nome usa o índice trigram em `search_name`.
 */
export class OffProducts1792100000000 implements MigrationInterface {
  name = 'OffProducts1792100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`
      CREATE TABLE off_products (
        code text PRIMARY KEY,
        name text NOT NULL,
        brand text,
        quantity text,
        serving_g real,
        countries text[] NOT NULL DEFAULT '{}',
        kcal real NOT NULL,
        protein real NOT NULL,
        carbs real NOT NULL,
        fat real NOT NULL,
        fiber real,
        sodium_mg real,
        search_name text NOT NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX off_products_search_name ON off_products USING gin (search_name gin_trgm_ops)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE off_products`);
  }
}
