// Contrato entre o front (nutriai-front) e o backend: formatos que as rotas de `api.md` recebem e
// devolvem. Arquivo único, sem dependências — gerado a partir de `src/lib/api/types.ts` do front.
// O backend faz todas as contas (metas, plano do dia, porções, trocas, estatísticas); o front só exibe.

// ---------------------------------------------------------------------------------------------
// Valores fixos

export type Sex = "feminino" | "masculino";
export type ActivityLevel = "sedentario" | "leve" | "moderado" | "intenso" | "extremo";
export type Goal = "perder" | "manter" | "ganhar";
/** Tipo de alimentação: o que a pessoa não come (o backend tira esses alimentos do que o assistente sugere). */
export type Diet = "onivora" | "pescetariana" | "vegetariana" | "vegana";

/** Motivo de trocar um alimento: "Não gosto", "Não quero", "Não tenho", "Não posso". */
export type FoodFeedback = "nao-gosto" | "nao-quero" | "nao-tenho" | "nao-posso";

/** Grupo do alimento no catálogo; substitutos são sempre do mesmo grupo. */
export type FoodGroup =
  | "carboidratos"
  | "proteinas"
  | "laticinios"
  | "gorduras"
  | "frutas"
  | "vegetais"
  | "adocantes"
  | "acidos";

export type Profile = {
  sex: Sex;
  /** 14–100 anos. */
  age: number;
  /** 30–300 kg, uma casa decimal. */
  weightKg: number;
  /** 120–230 cm. */
  heightCm: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  /** Peso meta (30–300 kg, uma casa decimal): obrigatório para perder ou ganhar; `null` com manter. Pode mudar depois do cadastro. */
  targetWeightKg: number | null;
};

/** Período do dia: manhã até 10:59, tarde até 16:59, noite depois. */
export type DayPeriod = "manha" | "tarde" | "noite";

/** Refeição do dia que a pessoa faz (cada uma é uma refeição do plano). */
export type MealSlot = "cafe-da-manha" | "lanche-da-manha" | "almoco" | "lanche-da-tarde" | "jantar" | "ceia";

/** Rotina e preferências alimentares: o assistente monta o plano individual a partir dela. */
export type Routine = {
  /** Janelas em que dá para comer ("HH:MM"), em ordem, sem sobreposição e com início antes do fim. De 1 a 12. */
  eatingWindows: { start: string; end: string }[];
  /** "HH:MM" */
  wakeTime: string;
  /** "HH:MM"; pode ser antes de `wakeTime` (dorme depois da meia-noite). */
  sleepTime: string;
  /** "HH:MM"; `null` = não treina (os dois horários do treino vêm juntos: ambos preenchidos ou ambos `null`). */
  trainingStart: string | null;
  /** "HH:MM"; pode ser antes de `trainingStart` (treino que passa da meia-noite). */
  trainingEnd: string | null;
  /** Refeições que a pessoa faz no dia: pelo menos uma, sem repetir (o backend guarda na ordem do dia). */
  meals: MealSlot[];
  /** Período do dia em que sente mais fome; `null` = não sente mais fome em nenhum ("Não sinto"). */
  hungriestPeriod: DayPeriod | null;
  /** Período do dia em que sente menos fome (diferente de `hungriestPeriod`); `null` = "Não sinto". */
  leastHungryPeriod: DayPeriod | null;
  /** Dia da semana do lembrete de pesagem: 0 = domingo … 6 = sábado. */
  weighInDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  diet: Diet;
};

// ---------------------------------------------------------------------------------------------
// Usuário

/** Metas calculadas a partir do perfil. */
export type Targets = {
  /** Meta diária de calorias (kcal). */
  calories: number;
  /** Taxa metabólica basal (kcal). */
  bmr: number;
  /** Gasto diário estimado (kcal). */
  tdee: number;
  waterLiters: number;
  /** A meta foi elevada ao mínimo recomendado. */
  clampedToMinimum: boolean;
};

export type Me = {
  user: { name: string; username: string };
  /** `null` até o usuário preencher o perfil. */
  profile: Profile | null;
  /** `null` até o usuário preencher a rotina (segundo passo do cadastro). */
  routine: Routine | null;
  targets: Targets | null;
  /** Hoje é o dia de pesagem da rotina e ainda não há peso registrado hoje. */
  weighInDue: boolean;
  /**
   * Conta Google conectada (dá acesso à Google Health API); `null` se não houver.
   * `canDisconnect` é `false` quando o Google é o único jeito de entrar (conta criada pelo Google).
   */
  google: { email: string; canDisconnect: boolean } | null;
};

/** Projeção do peso até `profile.targetWeightKg`, comendo a meta calórica. */
export type WeightProjection = {
  /** Meses até a meta, com uma casa decimal. */
  months: number;
  /** O mesmo tempo em meses inteiros e dias: do primeiro ao último ponto de `points`. */
  duration: { months: number; days: number };
  /** Variação por semana (kg, uma casa decimal; negativa ao perder). */
  weeklyChangeKg: number;
  /**
   * Um ponto por mês desde o mês 0 (peso atual, no dia em que o peso meta foi salvo — ou hoje, se ainda não foi);
   * o último é o peso meta, no mês (fracionário) em que chega. `date` ("AAAA-MM-DD"): o mês 0 mais `month` meses
   * (mesmo dia do calendário).
   */
  points: { month: number; date: string; weightKg: number }[];
};

export type AuthResponse = { token: string };

/** URL de consentimento do Google para conectar a conta já logada. */
export type GoogleLinkResponse = { url: string };

/** Peso registrado pelo usuário. Só histórico: não altera `profile.weightKg` nem a meta calórica. */
export type WeightEntry = {
  id: string;
  /** Data/hora da pesagem em ISO 8601. */
  at: string;
  kg: number;
};

// ---------------------------------------------------------------------------------------------
// Plano alimentar

export type Totals = { carbs: number; protein: number; fat: number; kcal: number };

/** Alimento numa porção: quantidade sempre em gramas, nutrientes já calculados para ela. */
export type PlanFood = Totals & { name: string; grams: number };

export type PlanMeal = {
  id: number;
  title: string;
  /** "HH:MM" */
  time: string;
  totals: Totals;
  /** `extraId` preenchido = alimento acrescentado pelo usuário, que pode ser removido. */
  foods: (PlanFood & { extraId: string | null })[];
};

export type Personalization = "pending" | "ready" | "failed" | null;

/** Plano de hoje já com todas as mudanças do usuário, ordenado por horário. */
export type TodayPlan = {
  meals: PlanMeal[];
  /**
   * Plano individual montado pelo assistente na primeira vez que a rotina é salva (e quando o usuário pede para
   * refazer, com `POST /plan/personalize`): `pending` enquanto monta (o plano atual aparece por baixo), `failed`
   * se não deu certo, `ready` quando aplicado e `null` se nunca foi pedido.
   */
  personalization: Personalization;
};

export type FoodSearchResult = {
  /** Se o texto bateu com alimentos da base; senão, `options` são sugestões parecidas. */
  found: boolean;
  /** O alimento digitado existe, mas está restrito pelo usuário. */
  restricted: { name: string; feedback: FoodFeedback } | null;
  /** Cada opção na porção escolhida pelo assistente e quanto as porções do dia diminuem com ela (%). */
  options: { food: PlanFood; reductionPercent: number }[];
};

/** Alimento marcado pelo usuário, listado na página Alimentos. */
export type RestrictedFood = {
  name: string;
  feedback: FoodFeedback;
  group: FoodGroup | null;
  /** "Não quero": a troca vale só na refeição marcada. */
  onlyInMeal: boolean;
  /** Substituto nas refeições; `null` = removido sem substituto. */
  substitute: string | null;
};

// ---------------------------------------------------------------------------------------------
// Nutrientes

export type Nutrient = {
  /** Identificador estável (ex.: "fibras", "vitamina-c"). */
  id: string;
  name: string;
  /** Consumo de hoje. */
  atual: number;
  meta: number;
  unit: string;
  /** `meta` é um limite máximo (ficar abaixo é o bom), não um alvo a atingir. */
  limit?: boolean;
};

export type MacroId = "proteinas" | "gorduras" | "carboidratos";

/** Macronutriente do dia, também em g por kg de peso corporal (as metas são 2 g/kg de proteína e 1 g/kg de gordura). */
export type MacroNutrient = Nutrient & {
  id: MacroId;
  /** `atual` e `meta` em g/kg de peso, com uma casa decimal; `null` sem perfil. */
  perKg: { atual: number; meta: number } | null;
};

export type NutritionToday = {
  consumedKcal: number;
  /** Calorias gastas hoje (Google Fit / Apple Saúde); `null` sem dados. */
  burnedKcal: number | null;
  /** Em gramas (e em g/kg em `perKg`). */
  macros: MacroNutrient[];
  fibers: Nutrient[];
  /** Açúcares, gordura saturada, colesterol… */
  otherMacros: Nutrient[];
  vitamins: Nutrient[];
  minerals: Nutrient[];
};

/** Grupos de nutrientes do seletor do gráfico do histórico. */
export type NutrientGroup = {
  name: string;
  nutrients: { id: string; name: string; unit: string; limit?: boolean }[];
};

// ---------------------------------------------------------------------------------------------
// Histórico

export type HistorySummary = {
  avgConsumed: number;
  avgBurned: number;
  /** Consumida − gasta; negativo = déficit. */
  avgBalance: number;
  daysOnGoal: number;
  totalDays: number;
  calorieGoal: number;
  /** Um dia conta como "dentro da meta" até esta distância da meta (kcal). */
  goalTolerance: number;
};

/** Um dia de atividade (Google Fit / Apple Saúde) somado ao consumo registrado. */
export type ActivityDay = {
  /** "AAAA-MM-DD" */
  date: string;
  consumed: number;
  burned: number;
  activeCalories: number;
  steps: number;
  activeMinutes: number;
  distanceKm: number;
  source: string;
};

export type ActivityHistory = {
  /** Do mais antigo para o mais recente. */
  days: ActivityDay[];
  averages: { steps: number; activeCalories: number; activeMinutes: number };
  totalDistanceKm: number;
};

export type NutrientHistory = {
  nutrient: { id: string; name: string; unit: string; meta: number; limit?: boolean };
  days: { date: string; value: number }[];
  average: number;
  /** Média em % da meta (ou do limite). */
  averagePercent: number;
  daysOnGoal: number;
  daysOverLimit: number;
};

export type PlanHistoryDay = {
  date: string;
  followedCount: number;
  plannedKcal: number;
  meals: { time: string; title: string; kcal: number; followed: boolean }[];
  flaggedFoods: { name: string; feedback: FoodFeedback }[];
};

export type ActivitySource = {
  name: string;
  platform: string;
  connected: boolean;
  /** ISO 8601, ou `null` se nunca sincronizou. */
  lastSync: string | null;
};

// ---------------------------------------------------------------------------------------------
// Chat

export type ChatMessage = { id: string; role: "assistant" | "user"; text: string };
