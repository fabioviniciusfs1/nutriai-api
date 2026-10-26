import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Ajuste da dieta do usuário (proteína e gordura por kg, peso da unidade do ovo); `null` = os padrões. */
export class DietSettings1791200000000 implements MigrationInterface {
  name = 'DietSettings1791200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN diet_settings jsonb`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN diet_settings`);
  }
}
