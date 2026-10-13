import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * O treino da rotina passa a ter início e fim: `trainingTime` vira `trainingStart`, e `trainingEnd` fica uma
 * hora depois. Quem estava como "não treino" (`null`) fica com os dois `null` até salvar a rotina de novo.
 */
export class TrainingEnd1790800000000 implements MigrationInterface {
  name = 'TrainingEnd1790800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
         SET routine = routine - 'trainingTime' || jsonb_build_object(
               'trainingStart', routine->'trainingTime',
               'trainingEnd',
               CASE WHEN routine->>'trainingTime' IS NULL THEN 'null'::jsonb
                    ELSE to_jsonb(to_char(
                      (routine->>'trainingTime')::time + interval '1 hour', 'HH24:MI'))
               END)
       WHERE routine IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
         SET routine = routine - 'trainingStart' - 'trainingEnd'
               || jsonb_build_object('trainingTime', routine->'trainingStart')
       WHERE routine IS NOT NULL`);
  }
}
