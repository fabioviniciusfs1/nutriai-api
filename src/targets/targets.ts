// Metas a partir do perfil (porte de `reference/calorie-target.ts`).
import type {
  ActivityLevel,
  DietSettings,
  Goal,
  MacroId,
  Profile,
  Sex,
  Targets,
  WeightProjection,
} from '../contract.js';
import { addDays, addMonths } from '../common/timezone.js';

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

/** Água: 35 ml por kg de peso. */
const WATER_ML_PER_KG = 35;

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
    // Em litros com uma casa decimal.
    waterLiters: Math.round((profile.weightKg * WATER_ML_PER_KG) / 100) / 10,
    waterMlPerKg: WATER_ML_PER_KG,
    clampedToMinimum: adjusted < minimum,
  };
}

/** Regra clássica: ~7.700 kcal de sobra (ou de falta) equivalem a 1 kg corporal. */
const KCAL_PER_KG = 7700;
const DAYS_PER_MONTH = 365.25 / 12;

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/**
 * Mensagem de erro quando o peso meta do perfil não combina com o objetivo; `null` se está tudo certo.
 * Obrigatório para perder ou ganhar; com manter, não há peso meta.
 */
export function targetWeightError(profile: Profile): string | null {
  const target = profile.targetWeightKg;
  if (profile.goal === 'manter')
    return target === null
      ? null
      : 'Com o objetivo de manter o peso, não há peso meta.';
  if (target === null) return 'Informe o peso meta.';
  if (profile.goal === 'perder' && target >= profile.weightKg)
    return 'Para perder peso, o peso meta deve ser menor que o atual.';
  if (profile.goal === 'ganhar' && target <= profile.weightKg)
    return 'Para ganhar peso, o peso meta deve ser maior que o atual.';
  return null;
}

/**
 * Em quanto tempo o perfil chega ao peso meta comendo a meta calórica: a diferença diária entre a meta e o
 * gasto (`calories − tdee`), constante, dividida por 7.700 kcal/kg. A projeção começa em `startDate`
 * ("AAAA-MM-DD", o dia em que o peso meta foi salvo), e cada mês cai no mesmo dia do calendário.
 * Devolve a mensagem de erro quando o objetivo é manter ou o peso meta falta ou não combina com ele.
 */
export function projectWeight(
  profile: Profile,
  startDate: string,
): WeightProjection | string {
  const error = targetWeightError(profile);
  if (error) return error;
  const targetWeightKg = profile.targetWeightKg;
  if (targetWeightKg === null)
    return 'Com o objetivo de manter o peso, não há peso meta.';

  const { calories, tdee } = calculateTargets(profile);
  // Com a meta no piso, o gasto pode ficar abaixo dela: comendo a meta, o peso não cai.
  if (profile.goal === 'perder' && calories >= tdee)
    return 'Com a meta mínima de calorias, não dá para estimar quando o peso meta chega. Procure um nutricionista.';
  const kgPerMonth = ((calories - tdee) / KCAL_PER_KG) * DAYS_PER_MONTH;
  const exactMonths = (targetWeightKg - profile.weightKg) / kgPerMonth;
  const points: WeightProjection['points'] = [];
  for (let month = 0; month < exactMonths; month++)
    points.push({
      month,
      date: addMonths(startDate, month),
      weightKg: oneDecimal(profile.weightKg + kgPerMonth * month),
    });
  const wholeMonths = Math.floor(exactMonths);
  const extraDays = Math.round((exactMonths - wholeMonths) * DAYS_PER_MONTH);
  points.push({
    month: oneDecimal(exactMonths),
    date: addDays(addMonths(startDate, wholeMonths), extraDays),
    weightKg: targetWeightKg,
  });
  return {
    months: oneDecimal(exactMonths),
    duration: { months: wholeMonths, days: extraDays },
    weeklyChangeKg: oneDecimal((kgPerMonth / DAYS_PER_MONTH) * 7),
    points,
  };
}

/** Meta calórica usada quando o usuário ainda não tem perfil. */
export const DEFAULT_CALORIE_GOAL = 2000;

/** Proteína e gordura por kg de peso corporal, por dia, sem ajuste da dieta (`/me/diet`). */
export const PROTEIN_G_PER_KG = 2;
export const FAT_G_PER_KG = 1;

/**
 * Metas de macronutrientes (g) do perfil: proteína e gordura pelos g/kg do ajuste da dieta (padrão 2 g/kg e
 * 1 g/kg) e o restante da meta calórica em carboidratos (4/9/4 kcal por grama). Se proteína e gordura já passam
 * da meta calórica, o carboidrato fica em 0.
 */
export function macroTargets(
  profile: Profile,
  perKg: Pick<DietSettings, 'proteinPerKg' | 'fatPerKg'> = {
    proteinPerKg: PROTEIN_G_PER_KG,
    fatPerKg: FAT_G_PER_KG,
  },
) {
  const { calories } = calculateTargets(profile);
  const protein = profile.weightKg * perKg.proteinPerKg;
  const fat = profile.weightKg * perKg.fatPerKg;
  const carbs = Math.max(0, (calories - protein * 4 - fat * 9) / 4);
  return {
    proteinas: Math.round(protein),
    gorduras: Math.round(fat),
    carboidratos: Math.round(carbs),
  };
}

const KCAL_PER_GRAM: Record<MacroId, number> = {
  proteinas: 4,
  carboidratos: 4,
  gorduras: 9,
};

/**
 * Parte das calorias dos macros que vem de cada um, em % inteiros que somam 100 (os pontos que o
 * arredondamento perde vão para as maiores sobras); `null` sem nenhuma caloria.
 */
export function macroSplit(
  grams: Record<MacroId, number>,
): Record<MacroId, number> | null {
  const ids = Object.keys(KCAL_PER_GRAM) as MacroId[];
  const kcal = ids.map((id) => grams[id] * KCAL_PER_GRAM[id]);
  const total = kcal.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  const exact = kcal.map((value) => (value / total) * 100);
  const percents = exact.map(Math.floor);
  const missing = 100 - percents.reduce((sum, value) => sum + value, 0);
  const byRemainder = ids
    .map((_, index) => index)
    .sort((a, b) => exact[b] - percents[b] - (exact[a] - percents[a]));
  for (const index of byRemainder.slice(0, missing)) percents[index]++;
  return Object.fromEntries(
    ids.map((id, index) => [id, percents[index]]),
  ) as Record<MacroId, number>;
}

/** Gramas por kg de peso corporal, com uma casa decimal. */
export function perKg(grams: number, weightKg: number) {
  return Math.round((grams / weightKg) * 10) / 10;
}
