export const SEXES = [
  { id: "feminino", label: "Feminino" },
  { id: "masculino", label: "Masculino" },
] as const;

export const ACTIVITY_LEVELS = [
  { id: "sedentario", label: "Sedentário", description: "Pouco ou nenhum exercício", factor: 1.2 },
  { id: "leve", label: "Levemente ativo", description: "Exercício leve 1 a 3 dias por semana", factor: 1.375 },
  { id: "moderado", label: "Moderadamente ativo", description: "Exercício moderado 3 a 5 dias por semana", factor: 1.55 },
  { id: "intenso", label: "Muito ativo", description: "Exercício intenso 6 a 7 dias por semana", factor: 1.725 },
  { id: "extremo", label: "Extremamente ativo", description: "Treino pesado diário ou trabalho físico", factor: 1.9 },
] as const;

export const GOALS = [
  { id: "perder", label: "Perder peso", description: "Déficit de 500 kcal/dia (cerca de 0,5 kg por semana)", adjustment: -500 },
  { id: "manter", label: "Manter peso", description: "Consumo igual ao gasto diário", adjustment: 0 },
  { id: "ganhar", label: "Ganhar peso", description: "Superávit de 300 kcal/dia", adjustment: 300 },
] as const;

export const MEALS_PER_DAY = [3, 4, 5, 6] as const;

/** `id` segue `Date.getDay()` (0 = domingo); a lista começa na segunda. */
export const WEEKDAYS = [
  { id: 1, label: "Segunda" },
  { id: 2, label: "Terça" },
  { id: 3, label: "Quarta" },
  { id: 4, label: "Quinta" },
  { id: 5, label: "Sexta" },
  { id: 6, label: "Sábado" },
  { id: 0, label: "Domingo" },
] as const;

export type Profile = {
  sex: (typeof SEXES)[number]["id"];
  age: number;
  weightKg: number;
  heightCm: number;
  activityLevel: (typeof ACTIVITY_LEVELS)[number]["id"];
  goal: (typeof GOALS)[number]["id"];
  /** Quantas refeições a pessoa consegue fazer por dia. */
  mealsPerDay: (typeof MEALS_PER_DAY)[number];
  /** Dia da semana em que o app lembra de registrar o peso. */
  weighInDay: (typeof WEEKDAYS)[number]["id"];
};

// Pisos usuais para dietas sem acompanhamento médico.
const MINIMUM_CALORIES = { feminino: 1200, masculino: 1500 } as const;

export function calculateCalorieTarget(profile: Profile) {
  // Mifflin-St Jeor
  const bmr =
    10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + (profile.sex === "masculino" ? 5 : -161);
  const factor = ACTIVITY_LEVELS.find((level) => level.id === profile.activityLevel)!.factor;
  const tdee = bmr * factor;
  const adjusted = tdee + GOALS.find((goal) => goal.id === profile.goal)!.adjustment;
  const minimum = MINIMUM_CALORIES[profile.sex];

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    target: Math.max(minimum, Math.round(adjusted / 10) * 10),
    clampedToMinimum: adjusted < minimum,
  };
}

// 35 ml por kg de peso corporal, em litros com uma casa decimal.
export function calculateWaterLiters(weightKg: number) {
  return Math.round((weightKg * 35) / 100) / 10;
}
