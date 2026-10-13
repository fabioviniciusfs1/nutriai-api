import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A rotina passa a dizer quais refeições a pessoa faz, em vez de quantas:
 * - `base_meals.slot`: qual refeição do dia cada refeição base é (no lugar de `min_meals_per_day`);
 * - `users.routine`: `mealsPerDay` vira `meals`, com as refeições que aquela quantidade trazia.
 */
export class MealSlots1790700000000 implements MigrationInterface {
  name = 'MealSlots1790700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE base_meals ADD COLUMN slot text`);
    await queryRunner.query(`
      UPDATE base_meals
         SET slot = CASE id
               WHEN 1 THEN 'cafe-da-manha'
               WHEN 5 THEN 'lanche-da-manha'
               WHEN 2 THEN 'almoco'
               WHEN 4 THEN 'lanche-da-tarde'
               WHEN 3 THEN 'jantar'
               WHEN 6 THEN 'ceia'
             END`);
    await queryRunner.query(`DELETE FROM base_meals WHERE slot IS NULL`);
    await queryRunner.query(`
      ALTER TABLE base_meals
        ALTER COLUMN slot SET NOT NULL,
        DROP COLUMN min_meals_per_day`);

    await queryRunner.query(`
      UPDATE users
         SET routine = routine - 'mealsPerDay' || jsonb_build_object(
               'meals',
               CASE (routine->>'mealsPerDay')::int
                 WHEN 4 THEN '["cafe-da-manha","almoco","lanche-da-tarde","jantar"]'::jsonb
                 WHEN 5 THEN '["cafe-da-manha","lanche-da-manha","almoco","lanche-da-tarde","jantar"]'::jsonb
                 WHEN 6 THEN '["cafe-da-manha","lanche-da-manha","almoco","lanche-da-tarde","jantar","ceia"]'::jsonb
                 ELSE '["cafe-da-manha","almoco","jantar"]'::jsonb
               END)
       WHERE routine IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
         SET routine = routine - 'meals' || jsonb_build_object(
               'mealsPerDay',
               LEAST(6, GREATEST(3, jsonb_array_length(routine->'meals'))))
       WHERE routine IS NOT NULL`);

    await queryRunner.query(
      `ALTER TABLE base_meals ADD COLUMN min_meals_per_day int NOT NULL DEFAULT 3`,
    );
    await queryRunner.query(`
      UPDATE base_meals
         SET min_meals_per_day = CASE slot
               WHEN 'lanche-da-tarde' THEN 4
               WHEN 'lanche-da-manha' THEN 5
               WHEN 'ceia' THEN 6
               ELSE 3
             END`);
    await queryRunner.query(`ALTER TABLE base_meals DROP COLUMN slot`);
  }
}
