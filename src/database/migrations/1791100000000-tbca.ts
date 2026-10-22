import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Tabela da TBCA; o id do alimento na fonte passa a texto (os da TBCA são como `C0019D`). */
export class Tbca1791100000000 implements MigrationInterface {
  name = 'Tbca1791100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tbca_alimentos (
        id text PRIMARY KEY,
        nome text NOT NULL,
        categoria text NOT NULL,
        energia_kj numeric,
        energia_kcal numeric,
        umidade_g numeric,
        carboidrato_total_g numeric,
        carboidrato_disponivel_g numeric,
        proteina_g numeric,
        lipideos_g numeric,
        fibra_alimentar_g numeric,
        alcool_g numeric,
        cinzas_g numeric,
        colesterol_mg numeric,
        saturados_g numeric,
        monoinsaturados_g numeric,
        poliinsaturados_g numeric,
        trans_g numeric,
        calcio_mg numeric,
        ferro_mg numeric,
        sodio_mg numeric,
        magnesio_mg numeric,
        fosforo_mg numeric,
        potassio_mg numeric,
        zinco_mg numeric,
        cobre_mg numeric,
        selenio_mcg numeric,
        re_mcg numeric,
        rae_mcg numeric,
        vitamina_d_mcg numeric,
        vitamina_e_mg numeric,
        tiamina_mg numeric,
        riboflavina_mg numeric,
        niacina_mg numeric,
        piridoxina_mg numeric,
        vitamina_b12_mcg numeric,
        vitamina_c_mg numeric,
        folato_mcg numeric,
        sal_adicao_g numeric,
        acucar_adicao_g numeric
      )`);
    await queryRunner.query(
      `ALTER TABLE foods ALTER COLUMN source_id TYPE text USING source_id::text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM foods WHERE source <> 'taco'`);
    await queryRunner.query(
      `ALTER TABLE foods ALTER COLUMN source_id TYPE int USING source_id::int`,
    );
    await queryRunner.query(`DROP TABLE tbca_alimentos`);
  }
}
