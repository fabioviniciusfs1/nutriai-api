import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rotina por grupos de dias da semana, com um plano por grupo. A rotina vira `{ schedules, weighInDay, diet }`
 * (a de antes vira o grupo 1, com os 7 dias); o que é de cada plano sai de `plan_states` para `schedule_plans`
 * (grupo 1); `plan_states` fica com as restrições e as trocas gerais; as versões do plano ganham o grupo.
 */
export class RoutineSchedules1792000000000 implements MigrationInterface {
  name = 'RoutineSchedules1792000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
         SET routine = jsonb_build_object(
               'schedules', jsonb_build_array(
                 (routine - 'weighInDay' - 'diet')
                   || jsonb_build_object('id', 1, 'days', '[1, 2, 3, 4, 5, 6, 0]'::jsonb)),
               'weighInDay', routine->'weighInDay',
               'diet', routine->'diet')
       WHERE routine IS NOT NULL`);
    await queryRunner.query(`
      CREATE TABLE schedule_plans (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        schedule_id int NOT NULL,
        meal_times jsonb NOT NULL DEFAULT '{}',
        plan_changes jsonb NOT NULL DEFAULT '{"scales": {}, "extraFoods": {}}',
        meal_food_swaps jsonb NOT NULL DEFAULT '{}',
        next_extra_id int NOT NULL DEFAULT 1,
        personal_meals jsonb,
        personalization text,
        personalization_at timestamptz,
        version int NOT NULL,
        PRIMARY KEY (user_id, schedule_id)
      )`);
    await queryRunner.query(`
      INSERT INTO schedule_plans (user_id, schedule_id, meal_times, plan_changes, meal_food_swaps, next_extra_id,
                                  personal_meals, personalization, personalization_at, version)
      SELECT user_id, 1, meal_times, plan_changes, meal_food_swaps, next_extra_id,
             personal_meals, personalization, personalization_at, 1
        FROM plan_states`);
    await queryRunner.query(`
      ALTER TABLE plan_states
        DROP COLUMN meal_times,
        DROP COLUMN plan_changes,
        DROP COLUMN meal_food_swaps,
        DROP COLUMN next_extra_id,
        DROP COLUMN personal_meals,
        DROP COLUMN personalization,
        DROP COLUMN personalization_at`);
    await queryRunner.query(
      `ALTER TABLE plan_versions ADD COLUMN schedule_id int NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `CREATE INDEX plan_versions_user_schedule ON plan_versions (user_id, schedule_id, id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX plan_versions_user_schedule`);
    await queryRunner.query(
      `ALTER TABLE plan_versions DROP COLUMN schedule_id`,
    );
    await queryRunner.query(`
      ALTER TABLE plan_states
        ADD COLUMN meal_times jsonb NOT NULL DEFAULT '{}',
        ADD COLUMN plan_changes jsonb NOT NULL DEFAULT '{"scales": {}, "extraFoods": {}}',
        ADD COLUMN meal_food_swaps jsonb NOT NULL DEFAULT '{}',
        ADD COLUMN next_extra_id int NOT NULL DEFAULT 1,
        ADD COLUMN personal_meals jsonb,
        ADD COLUMN personalization text,
        ADD COLUMN personalization_at timestamptz`);
    // Volta o plano do primeiro grupo (o de menor id).
    await queryRunner.query(`
      UPDATE plan_states AS state
         SET meal_times = plan.meal_times,
             plan_changes = plan.plan_changes,
             meal_food_swaps = plan.meal_food_swaps,
             next_extra_id = plan.next_extra_id,
             personal_meals = plan.personal_meals,
             personalization = plan.personalization,
             personalization_at = plan.personalization_at
        FROM (SELECT DISTINCT ON (user_id) * FROM schedule_plans ORDER BY user_id, schedule_id) AS plan
       WHERE plan.user_id = state.user_id`);
    await queryRunner.query(`DROP TABLE schedule_plans`);
    await queryRunner.query(`
      UPDATE users
         SET routine = (routine->'schedules'->0) - 'id' - 'days'
               || jsonb_build_object('weighInDay', routine->'weighInDay', 'diet', routine->'diet')
       WHERE routine IS NOT NULL`);
  }
}
