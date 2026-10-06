import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1790000000000 implements MigrationInterface {
  name = 'Initial1790000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        username text NOT NULL UNIQUE,
        password_hash text,
        profile jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`
      CREATE TABLE google_accounts (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        sub text NOT NULL UNIQUE,
        email text NOT NULL,
        refresh_token_enc text,
        last_sync timestamptz
      )`);
    await queryRunner.query(`
      CREATE TABLE oauth_codes (
        code_hash text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        redirect_uri text NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz
      )`);
    await queryRunner.query(`
      CREATE TABLE weights (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        at timestamptz NOT NULL,
        kg numeric(4,1) NOT NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX weights_user_at ON weights (user_id, at)`,
    );
    await queryRunner.query(`
      CREATE TABLE plan_states (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        meal_times jsonb NOT NULL DEFAULT '{}',
        plan_changes jsonb NOT NULL DEFAULT '{"removed":[],"added":[],"extraFoods":{},"scales":{}}',
        day_plan jsonb,
        food_feedback jsonb NOT NULL DEFAULT '{}',
        food_substitutes jsonb NOT NULL DEFAULT '{}',
        meal_food_swaps jsonb NOT NULL DEFAULT '{}',
        next_extra_id int NOT NULL DEFAULT 1,
        version int NOT NULL
      )`);
    await queryRunner.query(`
      CREATE TABLE day_logs (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date date NOT NULL,
        meals jsonb NOT NULL,
        consumed_kcal int NOT NULL,
        nutrients jsonb NOT NULL,
        flagged_foods jsonb NOT NULL DEFAULT '[]',
        PRIMARY KEY (user_id, date)
      )`);
    await queryRunner.query(`
      CREATE TABLE activity_days (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date date NOT NULL,
        burned int NOT NULL,
        active_calories int NOT NULL,
        steps int NOT NULL,
        active_minutes int NOT NULL,
        distance_km double precision NOT NULL,
        source text NOT NULL,
        PRIMARY KEY (user_id, date)
      )`);
    await queryRunner.query(`
      CREATE TABLE chat_messages (
        id serial PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL,
        text text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX chat_messages_user_id ON chat_messages (user_id, id)`,
    );
    await queryRunner.query(`
      CREATE TABLE foods (
        name text PRIMARY KEY,
        "group" text NOT NULL,
        per100g jsonb NOT NULL,
        micros_per100g jsonb NOT NULL DEFAULT '{}'
      )`);
    await queryRunner.query(`
      CREATE TABLE meal_suggestions (
        title text PRIMARY KEY,
        periods jsonb NOT NULL,
        foods jsonb NOT NULL,
        position int NOT NULL
      )`);
    await queryRunner.query(`
      CREATE TABLE base_meals (
        id int PRIMARY KEY,
        title text NOT NULL,
        time text NOT NULL,
        foods jsonb NOT NULL
      )`);
    await queryRunner.query(`
      CREATE TABLE nutrient_defs (
        id text PRIMARY KEY,
        name text NOT NULL,
        unit text NOT NULL,
        meta double precision NOT NULL,
        "limit" boolean NOT NULL DEFAULT false,
        section text NOT NULL,
        group_name text NOT NULL,
        position int NOT NULL
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'nutrient_defs',
      'base_meals',
      'meal_suggestions',
      'foods',
      'chat_messages',
      'activity_days',
      'day_logs',
      'plan_states',
      'weights',
      'oauth_codes',
      'google_accounts',
      'users',
    ]) {
      await queryRunner.query(`DROP TABLE ${table}`);
    }
  }
}
