import type { DietSettings, Profile } from '../contract.js';
import type { NutrientDefEntity } from '../database/entities/index.js';
import { dietSettingsOf } from '../targets/diet.js';
import { macroTargets } from '../targets/targets.js';

/**
 * Meta diária de cada nutriente: a dos macronutrientes sai do peso, da meta calórica e do ajuste da dieta do
 * usuário, se houver perfil.
 */
export function nutrientGoal(
  def: NutrientDefEntity,
  profile: Profile | null,
  dietSettings: DietSettings | null,
  calorieGoal: number | null = null,
): number {
  if (profile && def.section === 'macros') {
    const goals = macroTargets(
      profile,
      dietSettingsOf(dietSettings),
      calorieGoal,
    ) as Record<string, number>;
    if (goals[def.id] !== undefined) return goals[def.id];
  }
  return def.meta;
}

/** Arredonda como o front mostra: inteiro, ou uma casa decimal para valores pequenos (ex.: vitamina B12). */
export function displayValue(value: number, goal: number) {
  return goal < 10 ? Math.round(value * 10) / 10 : Math.round(value);
}
