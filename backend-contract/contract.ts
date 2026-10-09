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

/** Motivo de trocar um alimento: "Não gosto", "Não quero", "Não tenho". */
export type FoodFeedback = "nao-gosto" | "nao-quero" | "nao-tenho";

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
  /** Quantas refeições a pessoa consegue fazer por dia. */
  mealsPerDay: 3 | 4 | 5 | 6;
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
  targets: Targets | null;
  /** Hoje é o dia de pesagem do perfil e ainda não há peso registrado hoje. */
  weighInDue: boolean;
  /**
   * Conta Google conectada (dá acesso à Google Health API); `null` se não houver.
   * `canDisconnect` é `false` quando o Google é o único jeito de entrar (conta criada pelo Google).
   */
  google: { email: string; canDisconnect: boolean } | null;
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
   * Plano individual montado pelo assistente na primeira vez que o perfil é salvo: `pending` enquanto monta
   * (o plano padrão aparece por baixo), `failed` se não deu certo (`POST /plan/personalize` tenta de novo),
   * `ready` quando aplicado e `null` se nunca foi pedido.
   */
  personalization: Personalization;
  /** Se o assistente tem sugestões para uma refeição nova. */
  canCreateMeal: boolean;
};

/** Como as calorias de uma refeição mudam com uma ação (mostrado antes de confirmar). */
export type KcalChange = { mealId: number; title: string; time: string; before: number; after: number };

export type RemoveMealOption = "suggest" | "redistribute" | "nothing";

export type RemovalOptions = {
  /** Refeição que o assistente sugere no lugar ("sugerir uma nova"); `null` se não houver. */
  suggestion: { title: string; kcal: number } | null;
  /** Refeições seguintes com as calorias antes/depois de "redistribuir" (vazio se não houver). */
  redistribution: KcalChange[];
};

export type CreateMealPreview = {
  /** Nome da refeição que o assistente sugere (ex.: "Omelete com Salada"); a refeição fica com o nome do usuário. */
  suggestion: string;
  /** Alimentos sugeridos, nas porções em que vão entrar no plano. */
  foods: PlanFood[];
  /** Totais da refeição que o assistente vai sugerir. */
  totals: Totals;
  /** Quanto as porções das outras refeições diminuem (%). */
  reductionPercent: number;
  changes: KcalChange[];
  /** Total do dia depois de criar (continua igual ao de antes). */
  dayKcal: number;
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
