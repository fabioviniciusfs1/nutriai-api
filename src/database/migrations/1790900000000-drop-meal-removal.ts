import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sem criar nem remover refeição (as refeições do dia vêm da rotina): saem as mudanças "só de hoje"
 * (`day_plan`), as refeições criadas e removidas de `plan_changes` e a lista fixa de sugestões.
 */
export class DropMealRemoval1790900000000 implements MigrationInterface {
  name = 'DropMealRemoval1790900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE plan_states DROP COLUMN day_plan`);
    await queryRunner.query(`
      UPDATE plan_states SET plan_changes = plan_changes - 'removed' - 'added'`);
    await queryRunner.query(`
      ALTER TABLE plan_states
        ALTER COLUMN plan_changes SET DEFAULT '{"extraFoods":{},"scales":{}}'`);
    await queryRunner.query(`DROP TABLE meal_suggestions`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // As sugestões voltam vazias (o seed antigo as preenchia); as refeições criadas e removidas não voltam.
    await queryRunner.query(`
      CREATE TABLE meal_suggestions (
        title text PRIMARY KEY,
        periods jsonb NOT NULL,
        foods jsonb NOT NULL,
        position int NOT NULL
      )`);
    await queryRunner.query(`
      ALTER TABLE plan_states
        ALTER COLUMN plan_changes
        SET DEFAULT '{"removed":[],"added":[],"extraFoods":{},"scales":{}}'`);
    await queryRunner.query(`
      UPDATE plan_states
         SET plan_changes = '{"removed":[],"added":[]}'::jsonb || plan_changes`);
    await queryRunner.query(
      `ALTER TABLE plan_states ADD COLUMN day_plan jsonb`,
    );
  }
}
