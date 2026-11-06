import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A rotina perde os períodos de mais e de menos fome (as calorias vão 35/35/30 pelos períodos do dia) e passa a
 * ter sempre café da manhã, almoço e jantar; a pessoa escolhe só os lanches.
 */
export class RoutineMainMeals1791900000000 implements MigrationInterface {
  name = 'RoutineMainMeals1791900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
         SET routine = jsonb_set(
               routine - 'hungriestPeriod' - 'leastHungryPeriod',
               '{meals}',
               (SELECT jsonb_agg(slot ORDER BY position)
                  FROM unnest(ARRAY['cafe-da-manha', 'lanche-da-manha', 'almoco', 'lanche-da-tarde', 'jantar', 'ceia'])
                       WITH ORDINALITY AS slots(slot, position)
                 WHERE slot IN ('cafe-da-manha', 'almoco', 'jantar')
                    OR COALESCE(routine->'meals', '[]'::jsonb) ? slot))
       WHERE routine IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
         SET routine = routine || '{"hungriestPeriod": null, "leastHungryPeriod": null}'::jsonb
       WHERE routine IS NOT NULL`);
  }
}
