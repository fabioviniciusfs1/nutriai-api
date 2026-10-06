// Metas a partir do perfil (porte de `reference/calorie-target.ts`).
import type {
  ActivityLevel,
  Goal,
  Profile,
  Sex,
  Targets,
} from '../contract.js';

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
  extremo: 1.9,
};

const GOAL_ADJUSTMENTS: Record<Goal, number> = {
  perder: -500,
  manter: 0,
  ganhar: 300,
};

/** Pisos usuais para dietas sem acompanhamento médico. */
const MINIMUM_CALORIES: Record<Sex, number> = {
  feminino: 1200,
  masculino: 1500,
};

export function calculateTargets(profile: Profile): Targets {
  // Mifflin-St Jeor
  const bmr =
    10 * profile.weightKg +
    6.25 * profile.heightCm -
    5 * profile.age +
    (profile.sex === 'masculino' ? 5 : -161);
  const tdee = bmr * ACTIVITY_FACTORS[profile.activityLevel];
  const adjusted = tdee + GOAL_ADJUSTMENTS[profile.goal];
  const minimum = MINIMUM_CALORIES[profile.sex];
  return {
    calories: Math.max(minimum, Math.round(adjusted / 10) * 10),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    // 35 ml por kg, em litros com uma casa decimal.
    waterLiters: Math.round((profile.weightKg * 35) / 100) / 10,
    clampedToMinimum: adjusted < minimum,
  };
}

/** Meta calórica usada quando o usuário ainda não tem perfil. */
export const DEFAULT_CALORIE_GOAL = 2000;

/** Proteína e gordura por kg de peso corporal, por dia. */
export const PROTEIN_G_PER_KG = 2;
export const FAT_G_PER_KG = 1;

/**
 * Metas de macronutrientes (g) do perfil: 2 g/kg de proteína, 1 g/kg de gordura e o restante da meta
 * calórica em carboidratos (4/9/4 kcal por grama). Se proteína e gordura já passam da meta calórica, o
 * carboidrato fica em 0.
 */
export function macroTargets(profile: Profile) {
  const { calories } = calculateTargets(profile);
  const protein = profile.weightKg * PROTEIN_G_PER_KG;
  const fat = profile.weightKg * FAT_G_PER_KG;
  const carbs = Math.max(0, (calories - protein * 4 - fat * 9) / 4);
  return {
    proteinas: Math.round(protein),
    gorduras: Math.round(fat),
    carboidratos: Math.round(carbs),
  };
}

/** Gramas por kg de peso corporal, com uma casa decimal. */
export function perKg(grams: number, weightKg: number) {
  return Math.round((grams / weightKg) * 10) / 10;
}
