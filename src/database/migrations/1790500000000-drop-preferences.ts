import type { MigrationInterface, QueryRunner } from 'typeorm';

/** O perfil deixa de ter as preferências em texto livre ("Gostos e rotina"). */
export class DropPreferences1790500000000 implements MigrationInterface {
  name = 'DropPreferences1790500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users SET profile = profile - 'preferences'
       WHERE profile IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
         SET profile = profile || '{"preferences": ""}'::jsonb
       WHERE profile IS NOT NULL`);
  }
}
