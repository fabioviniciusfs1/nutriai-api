import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dia em que o peso meta foi salvo: é o começo da projeção. Quem já tinha peso meta fica com o dia da migration.
 */
export class TargetWeightDate1791000000000 implements MigrationInterface {
  name = 'TargetWeightDate1791000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN target_weight_set_on date`,
    );
    await queryRunner.query(`
      UPDATE users
         SET target_weight_set_on = (now() AT TIME ZONE 'America/Sao_Paulo')::date
       WHERE profile->>'targetWeightKg' IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN target_weight_set_on`,
    );
  }
}
