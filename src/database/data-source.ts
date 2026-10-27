import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities/index.js';
import { Initial1790000000000 } from './migrations/1790000000000-initial.js';
import { Taco1790100000000 } from './migrations/1790100000000-taco.js';
import { MealsPerDay1790200000000 } from './migrations/1790200000000-meals-per-day.js';
import { GoogleStartDate1790300000000 } from './migrations/1790300000000-google-start-date.js';
import { PersonalPlan1790400000000 } from './migrations/1790400000000-personal-plan.js';
import { DropPreferences1790500000000 } from './migrations/1790500000000-drop-preferences.js';
import { Routine1790600000000 } from './migrations/1790600000000-routine.js';
import { MealSlots1790700000000 } from './migrations/1790700000000-meal-slots.js';
import { TrainingEnd1790800000000 } from './migrations/1790800000000-training-end.js';
import { DropMealRemoval1790900000000 } from './migrations/1790900000000-drop-meal-removal.js';
import { TargetWeightDate1791000000000 } from './migrations/1791000000000-target-weight-date.js';
import { Tbca1791100000000 } from './migrations/1791100000000-tbca.js';
import { DietSettings1791200000000 } from './migrations/1791200000000-diet-settings.js';
import { LlmCalls1791300000000 } from './migrations/1791300000000-llm-calls.js';
import { PlanVersions1791400000000 } from './migrations/1791400000000-plan-versions.js';
import { PlanVersionChanges1791500000000 } from './migrations/1791500000000-plan-version-changes.js';
import { ExtraFoodDate1791600000000 } from './migrations/1791600000000-extra-food-date.js';

/** Migrations em ordem; as novas entram no fim da lista. */
export const MIGRATIONS = [
  Initial1790000000000,
  Taco1790100000000,
  MealsPerDay1790200000000,
  GoogleStartDate1790300000000,
  PersonalPlan1790400000000,
  DropPreferences1790500000000,
  Routine1790600000000,
  MealSlots1790700000000,
  TrainingEnd1790800000000,
  DropMealRemoval1790900000000,
  TargetWeightDate1791000000000,
  Tbca1791100000000,
  DietSettings1791200000000,
  LlmCalls1791300000000,
  PlanVersions1791400000000,
  PlanVersionChanges1791500000000,
  ExtraFoodDate1791600000000,
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
