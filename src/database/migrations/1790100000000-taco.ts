import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Tabela da TACO e catálogo do app ligado à fonte de cada alimento. */
export class Taco1790100000000 implements MigrationInterface {
  name = 'Taco1790100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE taco_alimentos (
        id int PRIMARY KEY,
        nome text NOT NULL,
        categoria text NOT NULL,
        energia_kcal numeric,
        energia_kj numeric,
        proteina_g numeric,
        lipideos_g numeric,
        colesterol_mg numeric,
        carboidrato_g numeric,
        fibra_alimentar_g numeric,
        cinzas_g numeric,
        calcio_mg numeric,
        magnesio_mg numeric,
        manganes_mg numeric,
        fosforo_mg numeric,
        ferro_mg numeric,
        sodio_mg numeric,
        potassio_mg numeric,
        cobre_mg numeric,
        zinco_mg numeric,
        retinol_mcg numeric,
        re_mcg numeric,
        rae_mcg numeric,
        tiamina_mg numeric,
        riboflavina_mg numeric,
        piridoxina_mg numeric,
        niacina_mg numeric,
        vitamina_c_mg numeric,
        saturados_g numeric,
        monoinsaturados_g numeric,
        poliinsaturados_g numeric
      )`);

    // O catálogo antigo (mock do front) sai: o novo vem da TACO, pelo comando de importação. O estado do
    // plano dos usuários cita alimentos do catálogo antigo, então é zerado (só havia dados de desenvolvimento).
    await queryRunner.query(
      `TRUNCATE plan_states, base_meals, meal_suggestions, foods`,
    );
    await queryRunner.query(
      `ALTER TABLE foods ALTER COLUMN "group" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE foods ADD COLUMN source text NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE foods ADD COLUMN source_id int NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE foods ADD CONSTRAINT foods_source_unique UNIQUE (source, source_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `TRUNCATE plan_states, base_meals, meal_suggestions, foods`,
    );
    await queryRunner.query(
      `ALTER TABLE foods DROP CONSTRAINT foods_source_unique`,
    );
    await queryRunner.query(`ALTER TABLE foods DROP COLUMN source_id`);
    await queryRunner.query(`ALTER TABLE foods DROP COLUMN source`);
    await queryRunner.query(
      `ALTER TABLE foods ALTER COLUMN "group" SET NOT NULL`,
    );
    await queryRunner.query(`DROP TABLE taco_alimentos`);
  }
}
