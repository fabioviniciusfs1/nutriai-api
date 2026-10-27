import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Meta calórica ajustada pelo usuário (±10%) e quando foi o ajuste; objetivo de agora (pelo último peso meta,
 * acima ou abaixo do peso atual) e quando ele virou.
 */
export class CalorieGoal1791800000000 implements MigrationInterface {
  name = 'CalorieGoal1791800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users
         ADD COLUMN calorie_goal int NULL,
         ADD COLUMN calorie_goal_set_at timestamptz NULL,
         ADD COLUMN weight_goal text NULL,
         ADD COLUMN weight_goal_set_at timestamptz NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users
         DROP COLUMN calorie_goal,
         DROP COLUMN calorie_goal_set_at,
         DROP COLUMN weight_goal,
         DROP COLUMN weight_goal_set_at`,
    );
  }
}
