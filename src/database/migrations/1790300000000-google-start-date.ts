import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dia 0 da conta Google: o dia em que ela foi conectada. A atividade só é importada a partir dele.
 * Para as contas que já existiam, usa o dia em que o usuário foi criado e apaga a atividade anterior.
 */
export class GoogleStartDate1790300000000 implements MigrationInterface {
  name = 'GoogleStartDate1790300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE google_accounts ADD COLUMN start_date date`,
    );
    await queryRunner.query(`
      UPDATE google_accounts g
         SET start_date = (u.created_at AT TIME ZONE 'America/Sao_Paulo')::date
        FROM users u
       WHERE u.id = g.user_id`);
    await queryRunner.query(
      `ALTER TABLE google_accounts ALTER COLUMN start_date SET NOT NULL`,
    );
    await queryRunner.query(`
      DELETE FROM activity_days a
       USING google_accounts g
       WHERE a.user_id = g.user_id AND a.date < g.start_date`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE google_accounts DROP COLUMN start_date`,
    );
  }
}
