import type { MigrationInterface, QueryRunner } from 'typeorm';
import type { PlanHistoryChange, PlanHistoryEdit } from '../../contract.js';
import { planChanges } from '../../plan/plan-versions.js';
import type { PlanVersionMeal } from '../entities/index.js';

/** Alteração gravada: as de antes desta migration não têm o dia. */
type StoredEdit = PlanHistoryChange & { at: string | null; date?: string };

type VersionRow = {
  id: number;
  user_id: string;
  date: string;
  edited: boolean;
  fingerprint: string;
  meals: PlanVersionMeal[];
  totals: object;
  changes: StoredEdit[] | null;
};

/**
 * O histórico de planos passou a ter um plano por montagem (`assembled_at`), com as alterações dentro dele. Cada
 * versão montada absorve as alteradas que vieram depois dela: fica com as refeições da última e com as alterações
 * de todas (cada uma com o dia da versão de onde veio). As versões de antes não distinguem um plano refeito de
 * uma alteração: o refeito vira alterações do montado.
 */
export class PlanVersionsPerAssembly1791700000000 implements MigrationInterface {
  name = 'PlanVersionsPerAssembly1791700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE plan_versions ADD COLUMN assembled_at timestamptz NULL`,
    );
    const rows = (await queryRunner.query(
      `SELECT id, user_id, to_char(date, 'YYYY-MM-DD') AS date, edited, fingerprint, meals, totals, changes
         FROM plan_versions ORDER BY user_id, id`,
    )) as VersionRow[];
    const groups: VersionRow[][] = [];
    for (const row of rows) {
      const group = groups.at(-1);
      if (!row.edited || !group || group[0].user_id !== row.user_id)
        groups.push([row]);
      else group.push(row);
    }
    for (const group of groups) {
      const [head] = group;
      const last = group[group.length - 1];
      let log: PlanHistoryEdit[] = (head.changes ?? []).map((edit) => ({
        ...edit,
        date: edit.date ?? head.date,
      }));
      group.slice(1).forEach((version, index) => {
        const edits: StoredEdit[] =
          version.changes ??
          planChanges(group[index].meals, version.meals).map((change) => ({
            ...change,
            at: null,
          }));
        log = [
          ...edits.map((edit) => ({
            ...edit,
            date: edit.date ?? version.date,
          })),
          ...log,
        ];
      });
      await queryRunner.query(
        `UPDATE plan_versions SET meals = $2, totals = $3, fingerprint = $4, changes = $5, edited = false
          WHERE id = $1`,
        [
          head.id,
          JSON.stringify(last.meals),
          JSON.stringify(last.totals),
          last.fingerprint,
          JSON.stringify(log),
        ],
      );
      if (group.length > 1)
        await queryRunner.query(
          `DELETE FROM plan_versions WHERE id = ANY($1)`,
          [group.slice(1).map((version) => version.id)],
        );
    }
    // O plano em vigor é o da montagem do assistente que está no estado, se houver.
    await queryRunner.query(
      `UPDATE plan_versions v SET assembled_at = s.personalization_at
         FROM plan_states s
        WHERE s.user_id = v.user_id AND s.personalization = 'ready'
          AND v.id = (SELECT max(id) FROM plan_versions WHERE user_id = v.user_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // As versões juntadas não voltam a ser separadas.
    await queryRunner.query(
      `ALTER TABLE plan_versions DROP COLUMN assembled_at`,
    );
  }
}
