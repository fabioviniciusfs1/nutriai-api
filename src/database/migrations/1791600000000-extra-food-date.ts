import type { MigrationInterface, QueryRunner } from 'typeorm';

type ExtraFoods = Record<string, { date?: string }[]>;

/**
 * O alimento extra passou a valer só no dia em que entrou (`date`). Os de antes, sem data, valem hoje: recebem a
 * data de hoje em São Paulo (o banco não guarda o fuso de cada usuário) e saem amanhã.
 */
export class ExtraFoodDate1791600000000 implements MigrationInterface {
  name = 'ExtraFoodDate1791600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const [{ today }] = (await queryRunner.query(
      `SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS today`,
    )) as { today: string }[];
    const rows = (await queryRunner.query(
      `SELECT user_id, plan_changes FROM plan_states`,
    )) as { user_id: string; plan_changes: { extraFoods?: ExtraFoods } }[];
    for (const { user_id, plan_changes } of rows) {
      const extraFoods = plan_changes.extraFoods ?? {};
      const missing = Object.values(extraFoods).some((extras) =>
        extras.some((extra) => extra.date === undefined),
      );
      if (!missing) continue;
      const dated = Object.fromEntries(
        Object.entries(extraFoods).map(([mealId, extras]) => [
          mealId,
          extras.map((extra) => ({ date: today, ...extra })),
        ]),
      );
      await queryRunner.query(
        `UPDATE plan_states SET plan_changes = $2 WHERE user_id = $1`,
        [user_id, JSON.stringify({ ...plan_changes, extraFoods: dated })],
      );
    }
  }

  async down(): Promise<void> {
    // A data a mais não atrapalha o código de antes.
  }
}
