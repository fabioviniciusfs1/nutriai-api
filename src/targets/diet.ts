// Ajuste da dieta: proteína e gordura por kg escolhidas pelo usuário, carboidrato com o restante da meta calórica.
import type {
  DietAdjustment,
  DietSettings,
  MacroId,
  Profile,
} from '../contract.js';
import { DEFAULT_EGG_UNIT_GRAMS } from '../plan/engine/foods.js';
import {
  calculateTargets,
  defaultMacrosPerKg,
  macroSplit,
  macroTargets,
} from './targets.js';

/**
 * Mínimos por kg de peso (o usuário não consegue baixar mais que isso). Proteína: 1,2 g/kg para quem é
 * sedentário, 1,6 g/kg para os outros.
 */
export function minProteinPerKg(profile: Profile) {
  return profile.activityLevel === 'sedentario' ? 1.2 : 1.6;
}
export const MIN_FAT_PER_KG = 0.6;

/** Peso da unidade do ovo que o usuário pode escolher (g). */
export const MIN_EGG_UNIT_GRAMS = 30;
export const MAX_EGG_UNIT_GRAMS = 90;

/**
 * Sem ajuste salvo: proteína e gordura pela atividade física (sedentário 1,2 e 0,7 g/kg; levemente ativo 1,6 e
 * 0,7 g/kg; os outros 2 e 1 g/kg) e ovo de 55 g.
 */
export function defaultDietSettings(profile: Profile): DietSettings {
  return {
    ...defaultMacrosPerKg(profile),
    eggUnitGrams: DEFAULT_EGG_UNIT_GRAMS,
  };
}

/** Ajuste salvo do usuário; sem ajuste, os padrões do perfil. */
export function dietSettingsOf(
  saved: DietSettings | null,
  profile: Profile,
): DietSettings {
  return saved ?? defaultDietSettings(profile);
}

/** g/kg como o usuário lê (vírgula decimal). */
const formatPerKg = (value: number) => String(value).replace('.', ',');

/** Folga das contas com duas casas decimais (ex.: carboidrato −0,001 g/kg conta como 0). */
const TOLERANCE = 0.005;

const twoDecimals = (value: number) => Math.round(value * 100) / 100;
/** Para baixo, com duas casas: o máximo arredondado nunca passa do limite de verdade. */
const floorTwoDecimals = (value: number) =>
  Math.floor((value + 1e-9) * 100) / 100;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** Meta calórica por kg de peso (`calorieGoal`: a ajustada pelo usuário; `null` = a do perfil). */
function kcalPerKg(profile: Profile, calorieGoal: number | null) {
  return calculateTargets(profile, calorieGoal).calories / profile.weightKg;
}

/** Carboidrato (g/kg) que sobra da meta calórica com essa proteína e essa gordura. */
function carbsPerKg(
  profile: Profile,
  { proteinPerKg, fatPerKg }: DietSettings,
  calorieGoal: number | null,
) {
  return (
    (kcalPerKg(profile, calorieGoal) - proteinPerKg * 4 - fatPerKg * 9) / 4
  );
}

/** Até onde cada macro pode ir com o ajuste atual (os outros dois no lugar, o compensado no mínimo). */
function limits(
  profile: Profile,
  settings: DietSettings,
  calorieGoal: number | null,
) {
  const kcal = kcalPerKg(profile, calorieGoal);
  return {
    minPerKg: {
      proteinas: minProteinPerKg(profile),
      gorduras: MIN_FAT_PER_KG,
      carboidratos: 0,
    } satisfies Record<MacroId, number>,
    maxPerKg: {
      // Proteína e gordura compensam no carboidrato (até 0); o carboidrato compensa na gordura (até o mínimo).
      proteinas: floorTwoDecimals((kcal - settings.fatPerKg * 9) / 4),
      gorduras: floorTwoDecimals((kcal - settings.proteinPerKg * 4) / 9),
      carboidratos: floorTwoDecimals(
        (kcal - settings.proteinPerKg * 4 - MIN_FAT_PER_KG * 9) / 4,
      ),
    } satisfies Record<MacroId, number>,
  };
}

/**
 * Muda um macro para `perKg` g/kg mantendo a meta calórica: proteína e gordura compensam no carboidrato; o
 * carboidrato compensa na gordura. Fora dos limites, fica no limite.
 */
export function adjustMacro(
  profile: Profile,
  settings: DietSettings,
  macro: MacroId,
  perKg: number,
  calorieGoal: number | null = null,
): DietSettings {
  const { minPerKg, maxPerKg } = limits(profile, settings, calorieGoal);
  const value = twoDecimals(clamp(perKg, minPerKg[macro], maxPerKg[macro]));
  if (macro === 'proteinas') return { ...settings, proteinPerKg: value };
  if (macro === 'gorduras') return { ...settings, fatPerKg: value };
  const fat =
    (kcalPerKg(profile, calorieGoal) - settings.proteinPerKg * 4 - value * 4) /
    9;
  return {
    ...settings,
    fatPerKg: Math.max(MIN_FAT_PER_KG, twoDecimals(fat)),
  };
}

/** Mensagem de erro do ajuste (`PUT /me/diet`); `null` se está tudo certo. */
export function dietSettingsError(
  profile: Profile,
  settings: DietSettings,
  calorieGoal: number | null = null,
): string | null {
  const minProtein = minProteinPerKg(profile);
  if (settings.proteinPerKg < minProtein)
    return `A proteína deve ser de pelo menos ${formatPerKg(minProtein)} g/kg.`;
  if (settings.fatPerKg < MIN_FAT_PER_KG)
    return `A gordura deve ser de pelo menos ${formatPerKg(MIN_FAT_PER_KG)} g/kg.`;
  if (carbsPerKg(profile, settings, calorieGoal) < -TOLERANCE)
    return 'Proteína e gordura passam da meta de calorias.';
  if (
    !Number.isInteger(settings.eggUnitGrams) ||
    settings.eggUnitGrams < MIN_EGG_UNIT_GRAMS ||
    settings.eggUnitGrams > MAX_EGG_UNIT_GRAMS
  )
    return 'O peso do ovo deve estar entre 30 e 90 g.';
  return null;
}

/** O ajuste com as contas feitas (resposta das rotas `/me/diet`). */
export function dietAdjustment(
  profile: Profile,
  settings: DietSettings,
  calorieGoal: number | null = null,
): DietAdjustment {
  const grams = macroTargets(profile, settings, calorieGoal);
  return {
    settings,
    calories: calculateTargets(profile, calorieGoal).calories,
    perKg: {
      proteinas: settings.proteinPerKg,
      gorduras: settings.fatPerKg,
      carboidratos: twoDecimals(
        Math.max(0, carbsPerKg(profile, settings, calorieGoal)),
      ),
    },
    grams,
    split: macroSplit(grams),
    ...limits(profile, settings, calorieGoal),
  };
}
