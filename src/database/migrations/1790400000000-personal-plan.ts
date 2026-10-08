import type { MigrationInterface, QueryRunner } from 'typeorm';
import { animalTags } from '../../plan/engine/diet.js';

/**
 * Plano individual montado pelo assistente e tipo de alimentação no perfil:
 * - `foods.animal`: origens animais de cada alimento (calculadas pela categoria da TACO e pelo nome);
 * - `plan_states`: as refeições do assistente e o estado da montagem;
 * - perfis existentes ficam "sem restrição" e sem preferências.
 */
export class PersonalPlan1790400000000 implements MigrationInterface {
  name = 'PersonalPlan1790400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE foods ADD COLUMN animal text[] NOT NULL DEFAULT '{}'`,
    );
    const foods = (await queryRunner.query(`
      SELECT f.name, t.categoria
        FROM foods f
        LEFT JOIN taco_alimentos t ON f.source = 'taco' AND t.id = f.source_id`)) as {
      name: string;
      categoria: string | null;
    }[];
    for (const food of foods) {
      const tags = animalTags(food.categoria ?? '', food.name);
      if (tags.length > 0)
        await queryRunner.query(
          `UPDATE foods SET animal = $1 WHERE name = $2`,
          [tags, food.name],
        );
    }

    await queryRunner.query(`
      ALTER TABLE plan_states
        ADD COLUMN personal_meals jsonb,
        ADD COLUMN personalization text,
        ADD COLUMN personalization_at timestamptz`);

    await queryRunner.query(`
      UPDATE users
         SET profile = profile || '{"diet": "onivora", "preferences": ""}'::jsonb
       WHERE profile IS NOT NULL AND NOT profile ? 'diet'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users SET profile = profile - 'diet' - 'preferences'
       WHERE profile IS NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE plan_states
        DROP COLUMN personal_meals,
        DROP COLUMN personalization,
        DROP COLUMN personalization_at`);
    await queryRunner.query(`ALTER TABLE foods DROP COLUMN animal`);
  }
}
