import type { MigrationInterface, QueryRunner } from 'typeorm';

/** "Alimentos que você não come": regras por tipo de alimento, valendo em todos os planos do usuário. */
export class FoodAvoid1792200000000 implements MigrationInterface {
  name = 'FoodAvoid1792200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE plan_states ADD COLUMN food_avoid jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE plan_states DROP COLUMN food_avoid`);
  }
}
