import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Versões do plano de cada usuário (histórico de planos). */
export class PlanVersions1791400000000 implements MigrationInterface {
  name = 'PlanVersions1791400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE plan_versions (
        id serial PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date date NOT NULL,
        edited boolean NOT NULL,
        fingerprint text NOT NULL,
        meals jsonb NOT NULL,
        totals jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX plan_versions_user_id ON plan_versions (user_id, id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE plan_versions`);
  }
}
