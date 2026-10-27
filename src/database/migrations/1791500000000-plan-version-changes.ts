import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Alterações de cada versão do plano, com o horário (`null` nas versões de antes). */
export class PlanVersionChanges1791500000000 implements MigrationInterface {
  name = 'PlanVersionChanges1791500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE plan_versions ADD COLUMN changes jsonb NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE plan_versions DROP COLUMN changes`);
  }
}
