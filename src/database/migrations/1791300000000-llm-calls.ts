import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Log das chamadas ao Claude (chat, substitutos, plano individual) com pedido e resposta. */
export class LlmCalls1791300000000 implements MigrationInterface {
  name = 'LlmCalls1791300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE llm_calls (
        id serial PRIMARY KEY,
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        task text NOT NULL,
        model text NOT NULL,
        request jsonb NOT NULL,
        response jsonb,
        stop_reason text,
        input_tokens int,
        output_tokens int,
        duration_ms int NOT NULL,
        error text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX llm_calls_user_id ON llm_calls (user_id, id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE llm_calls`);
  }
}
