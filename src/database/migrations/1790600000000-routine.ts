import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A rotina (janelas para comer, sono, treino, fome, refeições por dia, pesagem e tipo de alimentação) sai do
 * perfil e ganha coluna própria. Quem já tinha perfil fica sem rotina e preenche no próximo acesso.
 */
export class Routine1790600000000 implements MigrationInterface {
  name = 'Routine1790600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN routine jsonb`);
    await queryRunner.query(`
      UPDATE users
         SET profile = profile - 'mealsPerDay' - 'weighInDay' - 'diet'
       WHERE profile IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
         SET profile = profile || jsonb_build_object(
               'mealsPerDay', COALESCE(routine->'mealsPerDay', '3'::jsonb),
               'weighInDay', COALESCE(routine->'weighInDay', '1'::jsonb),
               'diet', COALESCE(routine->'diet', '"onivora"'::jsonb))
       WHERE profile IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN routine`);
  }
}
