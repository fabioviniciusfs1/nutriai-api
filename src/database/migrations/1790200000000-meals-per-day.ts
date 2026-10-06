import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Lanches do plano base que só entram conforme as refeições por dia do perfil. */
export class MealsPerDay1790200000000 implements MigrationInterface {
  name = 'MealsPerDay1790200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE base_meals ADD COLUMN min_meals_per_day int NOT NULL DEFAULT 3`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM base_meals WHERE min_meals_per_day > 3`,
    );
    await queryRunner.query(
      `ALTER TABLE base_meals DROP COLUMN min_meals_per_day`,
    );
  }
}
