import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities/index.js';
import { Initial1790000000000 } from './migrations/1790000000000-initial.js';
import { Taco1790100000000 } from './migrations/1790100000000-taco.js';
import { MealsPerDay1790200000000 } from './migrations/1790200000000-meals-per-day.js';
import { GoogleStartDate1790300000000 } from './migrations/1790300000000-google-start-date.js';
import { PersonalPlan1790400000000 } from './migrations/1790400000000-personal-plan.js';
import { DropPreferences1790500000000 } from './migrations/1790500000000-drop-preferences.js';

/** Migrations em ordem; as novas entram no fim da lista. */
export const MIGRATIONS = [
  Initial1790000000000,
  Taco1790100000000,
  MealsPerDay1790200000000,
  GoogleStartDate1790300000000,
  PersonalPlan1790400000000,
  DropPreferences1790500000000,
];

export function dataSourceOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
  };
}
