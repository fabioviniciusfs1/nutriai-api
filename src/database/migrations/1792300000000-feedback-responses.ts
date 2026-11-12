import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Respostas do formulário de feedback (uma por usuário), também enviadas ao Google Forms. */
export class FeedbackResponses1792300000000 implements MigrationInterface {
  name = 'FeedbackResponses1792300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE feedback_responses (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        answers jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        google_sent_at timestamptz,
        google_error text
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE feedback_responses`);
  }
}
