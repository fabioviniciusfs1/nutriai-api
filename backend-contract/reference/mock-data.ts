import type { FoodFeedback } from "@/lib/food-feedback";
import type { WeightEntry } from "@/lib/auth";

// `kcalPerGram`: fator de Atwater, usado para somar as calorias consumidas no dia.
export const macroBreakdown = [
  { name: "Proteínas", atual: 145, meta: 150, color: "#f4623a", kcalPerGram: 4 },
  { name: "Gorduras", atual: 65, meta: 70, color: "#f9c9b8", kcalPerGram: 9 },
  { name: "Carboidratos", atual: 220, meta: 250, color: "#7fc1e8", kcalPerGram: 4 },
];

export type Nutrient = {
  name: string;
  atual: number;
  meta: number;
  unit: string;
  /** `meta` é um limite máximo (ficar abaixo é o bom), não um alvo a atingir. */
  limit?: boolean;
};

export const fibers: Nutrient[] = [{ name: "Fibras", atual: 22, meta: 30, unit: "g" }];

export const otherMacros: Nutrient[] = [
  { name: "Açúcares", atual: 38, meta: 50, unit: "g", limit: true },
  { name: "Gordura saturada", atual: 16, meta: 20, unit: "g", limit: true },
  { name: "Colesterol", atual: 210, meta: 300, unit: "mg", limit: true },
];

export const vitamins: Nutrient[] = [
  { name: "Vitamina A", atual: 620, meta: 900, unit: "µg" },
  { name: "Vitamina B12", atual: 2.1, meta: 2.4, unit: "µg" },
  { name: "Vitamina C", atual: 95, meta: 90, unit: "mg" },
  { name: "Vitamina D", atual: 8, meta: 15, unit: "µg" },
  { name: "Vitamina E", atual: 11, meta: 15, unit: "mg" },
  { name: "Vitamina K", atual: 110, meta: 120, unit: "µg" },
  { name: "Ácido fólico (B9)", atual: 310, meta: 400, unit: "µg" },
];

export const minerals: Nutrient[] = [
  { name: "Cálcio", atual: 780, meta: 1000, unit: "mg" },
  { name: "Ferro", atual: 12, meta: 8, unit: "mg" },
  { name: "Magnésio", atual: 290, meta: 420, unit: "mg" },
  { name: "Potássio", atual: 2900, meta: 3400, unit: "mg" },
  { name: "Sódio", atual: 1800, meta: 2000, unit: "mg", limit: true },
  { name: "Zinco", atual: 9, meta: 11, unit: "mg" },
  { name: "Selênio", atual: 48, meta: 55, unit: "µg" },
];


export const initialChatMessages = [
  {
    id: 1,
    role: "assistant" as const,
    text: "Olá, {nome}! Sou seu assistente nutricional. Como posso te ajudar hoje?",
  },
  {
    id: 2,
    role: "user" as const,
    text: "Quantas calorias eu já consumi hoje?",
  },
  {
    id: 3,
    role: "assistant" as const,
    text: "Até agora você consumiu 1.985 kcal, bem próximo da sua meta diária de 2.000 kcal. Continue assim!",
  },
];

export const chatSuggestions = [
  "Quantas calorias devo consumir hoje?",
  "Sugira uma refeição rica em proteína",
  "Como está minha meta de carboidratos?",
  "Dicas para o jantar de hoje",
];

export const chatFallbackReplies = [
  "Baseado no seu plano alimentar, recomendo manter o equilíbrio entre proteínas e carboidratos nas próximas refeições.",
  "Você está indo bem em relação à sua meta diária! Que tal incluir mais vegetais no jantar?",
  "Posso sugerir opções do seu plano alimentar com bom valor nutricional, quer ver as recomendações?",
];

export const mealPlan = [
  {
    id: 1,
    title: "Torrada de Abacate com Ovo Poché",
    time: "07:30",
    foods: [
      { name: "Pão integral", grams: 50, carbs: 24, protein: 6, fat: 2, kcal: 140 },
      { name: "Abacate", grams: 50, carbs: 4, protein: 1, fat: 10, kcal: 100 },
      { name: "Ovo poché", grams: 50, carbs: 1, protein: 6, fat: 5, kcal: 70 },
      { name: "Azeite de oliva", grams: 5, carbs: 0, protein: 0, fat: 5, kcal: 40 },
    ],
  },
  {
    id: 2,
    title: "Tacos de Camarão Grelhado com Salsa de Manga",
    time: "12:30",
    foods: [
      { name: "Tortilha integral", grams: 60, carbs: 22, protein: 5, fat: 3, kcal: 130 },
      { name: "Camarão grelhado", grams: 120, carbs: 0, protein: 20, fat: 2, kcal: 110 },
      { name: "Salsa de manga", grams: 80, carbs: 15, protein: 1, fat: 0, kcal: 65 },
      { name: "Guacamole", grams: 30, carbs: 1, protein: 0, fat: 7, kcal: 65 },
      { name: "Limão", grams: 20, carbs: 0, protein: 0, fat: 0, kcal: 5 },
    ],
  },
  {
    id: 3,
    title: "Bowl de Salmão com Quinoa e Legumes",
    time: "20:00",
    foods: [
      { name: "Salmão grelhado", grams: 130, carbs: 0, protein: 26, fat: 12, kcal: 220 },
      { name: "Quinoa cozida", grams: 100, carbs: 21, protein: 4, fat: 2, kcal: 120 },
      { name: "Brócolis no vapor", grams: 80, carbs: 6, protein: 3, fat: 0, kcal: 35 },
      { name: "Cenoura", grams: 50, carbs: 5, protein: 1, fat: 0, kcal: 20 },
      { name: "Azeite de oliva", grams: 5, carbs: 0, protein: 0, fat: 5, kcal: 40 },
    ],
  },
];

// Catálogo de alimentos com nutrientes por 100 g, agrupados. Ao marcar um alimento como
// "Não gosto / Não quero / Não tenho", os substitutos oferecidos são do mesmo grupo e entram
// com as mesmas calorias do alimento marcado. Todo alimento do plano precisa estar aqui.
export const FOOD_GROUPS = {
  carboidratos: "Carboidratos",
  proteinas: "Proteínas",
  laticinios: "Laticínios",
  gorduras: "Gorduras boas",
  frutas: "Frutas",
  vegetais: "Legumes e verduras",
  adocantes: "Adoçantes",
  acidos: "Temperos ácidos",
} as const;

export type FoodGroup = keyof typeof FOOD_GROUPS;

export const foodCatalog: {
  name: string;
  group: FoodGroup;
  per100g: { carbs: number; protein: number; fat: number; kcal: number };
}[] = [
  { name: "Pão integral", group: "carboidratos", per100g: { carbs: 48, protein: 12, fat: 4, kcal: 280 } },
  { name: "Tortilha integral", group: "carboidratos", per100g: { carbs: 37, protein: 8, fat: 5, kcal: 217 } },
  { name: "Quinoa cozida", group: "carboidratos", per100g: { carbs: 21, protein: 4, fat: 2, kcal: 120 } },
  { name: "Arroz integral", group: "carboidratos", per100g: { carbs: 23, protein: 3, fat: 1, kcal: 110 } },
  { name: "Batata-doce cozida", group: "carboidratos", per100g: { carbs: 20, protein: 2, fat: 0, kcal: 87 } },
  { name: "Granola sem açúcar", group: "carboidratos", per100g: { carbs: 63, protein: 10, fat: 13, kcal: 417 } },
  { name: "Aveia em flocos", group: "carboidratos", per100g: { carbs: 60, protein: 13, fat: 7, kcal: 367 } },
  { name: "Tapioca", group: "carboidratos", per100g: { carbs: 59, protein: 0, fat: 0, kcal: 240 } },
  { name: "Cuscuz de milho", group: "carboidratos", per100g: { carbs: 25, protein: 2, fat: 1, kcal: 112 } },
  { name: "Mandioca cozida", group: "carboidratos", per100g: { carbs: 30, protein: 1, fat: 0, kcal: 125 } },

  { name: "Ovo poché", group: "proteinas", per100g: { carbs: 1, protein: 13, fat: 10, kcal: 143 } },
  { name: "Ovos", group: "proteinas", per100g: { carbs: 1, protein: 13, fat: 10, kcal: 143 } },
  { name: "Camarão grelhado", group: "proteinas", per100g: { carbs: 0, protein: 17, fat: 2, kcal: 92 } },
  { name: "Salmão grelhado", group: "proteinas", per100g: { carbs: 0, protein: 20, fat: 9, kcal: 170 } },
  { name: "Peito de frango grelhado", group: "proteinas", per100g: { carbs: 0, protein: 30, fat: 3, kcal: 159 } },
  { name: "Tilápia assada", group: "proteinas", per100g: { carbs: 0, protein: 20, fat: 3, kcal: 107 } },
  { name: "Atum em água", group: "proteinas", per100g: { carbs: 0, protein: 26, fat: 1, kcal: 116 } },
  { name: "Patinho moído", group: "proteinas", per100g: { carbs: 0, protein: 36, fat: 7, kcal: 219 } },
  { name: "Tofu", group: "proteinas", per100g: { carbs: 2, protein: 8, fat: 4, kcal: 76 } },

  { name: "Iogurte grego natural", group: "laticinios", per100g: { carbs: 4, protein: 9, fat: 4, kcal: 88 } },
  { name: "Queijo branco", group: "laticinios", per100g: { carbs: 3, protein: 17, fat: 14, kcal: 216 } },
  { name: "Ricota", group: "laticinios", per100g: { carbs: 4, protein: 11, fat: 8, kcal: 140 } },
  { name: "Queijo cottage", group: "laticinios", per100g: { carbs: 3, protein: 11, fat: 4, kcal: 98 } },
  { name: "Kefir", group: "laticinios", per100g: { carbs: 5, protein: 3, fat: 3, kcal: 60 } },

  { name: "Abacate", group: "gorduras", per100g: { carbs: 8, protein: 2, fat: 20, kcal: 200 } },
  { name: "Azeite de oliva", group: "gorduras", per100g: { carbs: 0, protein: 0, fat: 100, kcal: 800 } },
  { name: "Guacamole", group: "gorduras", per100g: { carbs: 3, protein: 1, fat: 23, kcal: 217 } },
  { name: "Pasta de amendoim integral", group: "gorduras", per100g: { carbs: 20, protein: 27, fat: 47, kcal: 600 } },
  { name: "Mix de castanhas", group: "gorduras", per100g: { carbs: 20, protein: 18, fat: 52, kcal: 600 } },
  { name: "Semente de chia", group: "gorduras", per100g: { carbs: 42, protein: 17, fat: 31, kcal: 490 } },

  { name: "Salsa de manga", group: "frutas", per100g: { carbs: 19, protein: 1, fat: 0, kcal: 81 } },
  { name: "Morangos", group: "frutas", per100g: { carbs: 8, protein: 1, fat: 0, kcal: 35 } },
  { name: "Banana-prata", group: "frutas", per100g: { carbs: 26, protein: 1, fat: 0, kcal: 100 } },
  { name: "Mamão papaia", group: "frutas", per100g: { carbs: 10, protein: 0, fat: 0, kcal: 40 } },
  { name: "Maçã", group: "frutas", per100g: { carbs: 15, protein: 0, fat: 0, kcal: 56 } },
  { name: "Kiwi", group: "frutas", per100g: { carbs: 12, protein: 1, fat: 0, kcal: 51 } },

  { name: "Brócolis no vapor", group: "vegetais", per100g: { carbs: 7, protein: 4, fat: 0, kcal: 44 } },
  { name: "Cenoura", group: "vegetais", per100g: { carbs: 10, protein: 2, fat: 0, kcal: 40 } },
  { name: "Salada de folhas e tomate", group: "vegetais", per100g: { carbs: 5, protein: 1, fat: 0, kcal: 25 } },
  { name: "Espinafre refogado", group: "vegetais", per100g: { carbs: 4, protein: 2, fat: 0, kcal: 30 } },
  { name: "Abobrinha refogada", group: "vegetais", per100g: { carbs: 4, protein: 1, fat: 0, kcal: 25 } },
  { name: "Couve-flor cozida", group: "vegetais", per100g: { carbs: 4, protein: 2, fat: 0, kcal: 23 } },
  { name: "Vagem cozida", group: "vegetais", per100g: { carbs: 6, protein: 2, fat: 0, kcal: 30 } },

  { name: "Mel", group: "adocantes", per100g: { carbs: 82, protein: 0, fat: 0, kcal: 300 } },
  { name: "Geleia sem açúcar", group: "adocantes", per100g: { carbs: 38, protein: 0, fat: 0, kcal: 150 } },
  { name: "Tâmara", group: "adocantes", per100g: { carbs: 75, protein: 2, fat: 0, kcal: 280 } },

  { name: "Limão", group: "acidos", per100g: { carbs: 8, protein: 0, fat: 0, kcal: 25 } },
  { name: "Vinagre de maçã", group: "acidos", per100g: { carbs: 1, protein: 0, fat: 0, kcal: 20 } },
  { name: "Suco de laranja", group: "acidos", per100g: { carbs: 10, protein: 1, fat: 0, kcal: 45 } },
];

export type MealPeriod = "manha" | "tarde" | "noite";

/** Período do dia de um horário "HH:MM": manhã até 10:59, tarde até 16:59, noite depois. */
export function mealPeriod(time: string): MealPeriod {
  if (time < "11:00") return "manha";
  if (time < "17:00") return "tarde";
  return "noite";
}

// Refeições sugeridas pelo sistema: ao remover uma refeição ("sugerir uma nova", escolhe a de
// calorias mais próximas) e ao criar uma refeição (escolhe pelo período do horário informado).
export const mealAlternatives: {
  title: string;
  periods: MealPeriod[];
  foods: (typeof mealPlan)[number]["foods"];
}[] = [
  {
    title: "Iogurte Grego com Granola e Morangos",
    periods: ["manha", "tarde"],
    foods: [
      { name: "Iogurte grego natural", grams: 170, carbs: 7, protein: 15, fat: 7, kcal: 150 },
      { name: "Granola sem açúcar", grams: 30, carbs: 19, protein: 3, fat: 4, kcal: 125 },
      { name: "Morangos", grams: 100, carbs: 8, protein: 1, fat: 0, kcal: 35 },
      { name: "Mel", grams: 7, carbs: 6, protein: 0, fat: 0, kcal: 20 },
    ],
  },
  {
    title: "Frango Grelhado com Arroz Integral e Salada",
    periods: ["tarde", "noite"],
    foods: [
      { name: "Peito de frango grelhado", grams: 120, carbs: 0, protein: 36, fat: 4, kcal: 190 },
      { name: "Arroz integral", grams: 100, carbs: 23, protein: 3, fat: 1, kcal: 110 },
      { name: "Salada de folhas e tomate", grams: 80, carbs: 4, protein: 1, fat: 0, kcal: 20 },
      { name: "Azeite de oliva", grams: 5, carbs: 0, protein: 0, fat: 5, kcal: 40 },
    ],
  },
  {
    title: "Omelete de Espinafre com Pão Integral",
    periods: ["manha", "noite"],
    foods: [
      { name: "Ovos", grams: 100, carbs: 1, protein: 12, fat: 10, kcal: 140 },
      { name: "Espinafre refogado", grams: 50, carbs: 2, protein: 1, fat: 0, kcal: 15 },
      { name: "Queijo branco", grams: 30, carbs: 1, protein: 5, fat: 4, kcal: 65 },
      { name: "Pão integral", grams: 25, carbs: 12, protein: 3, fat: 1, kcal: 70 },
    ],
  },
  {
    title: "Tilápia Assada com Batata-Doce e Brócolis",
    periods: ["tarde", "noite"],
    foods: [
      { name: "Tilápia assada", grams: 150, carbs: 0, protein: 30, fat: 4, kcal: 160 },
      { name: "Batata-doce cozida", grams: 120, carbs: 24, protein: 2, fat: 0, kcal: 105 },
      { name: "Brócolis no vapor", grams: 80, carbs: 6, protein: 3, fat: 0, kcal: 35 },
      { name: "Azeite de oliva", grams: 5, carbs: 0, protein: 0, fat: 5, kcal: 40 },
    ],
  },
  {
    title: "Banana com Pasta de Amendoim e Aveia",
    periods: ["manha", "tarde"],
    foods: [
      { name: "Banana-prata", grams: 90, carbs: 23, protein: 1, fat: 0, kcal: 90 },
      { name: "Pasta de amendoim integral", grams: 15, carbs: 3, protein: 4, fat: 7, kcal: 90 },
      { name: "Aveia em flocos", grams: 15, carbs: 9, protein: 2, fat: 1, kcal: 55 },
    ],
  },
];

// Histórico: 90 dias até HISTORY_END, no formato em que viriam do Google Fit / Apple Saúde
// (atividade) somado ao consumo registrado no plano alimentar. Datas fixas para manter
// o render estático determinístico.
export const HISTORY_END = "2026-09-21";

function seeded(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export const activityHistory = Array.from({ length: 90 }, (_, i) => {
  const date = new Date(`${HISTORY_END}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (89 - i));
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;

  const steps = Math.round(5500 + seeded(i) * 6500 - (weekend ? 1500 : 0));
  const activeCalories = Math.round(steps * 0.04 + seeded(i + 100) * 180);

  return {
    date: date.toISOString().slice(0, 10),
    consumed: Math.round(1800 + seeded(i + 300) * 450 + (weekend ? 150 : 0)),
    burned: 1650 + activeCalories,
    activeCalories,
    steps,
    activeMinutes: Math.round(steps / 150 + seeded(i + 200) * 20),
    distanceKm: Math.round(steps * 0.00075 * 10) / 10,
    source: "Google Fit" as const,
  };
});

// Mesmos nutrientes da página Nutrientes, agrupados para o seletor do histórico.
export const nutrientGroups: { name: string; nutrients: Nutrient[] }[] = [
  {
    name: "Macronutrientes",
    nutrients: [
      ...macroBreakdown.map(({ name, atual, meta }) => ({ name, atual, meta, unit: "g" })),
      ...fibers,
      ...otherMacros,
    ],
  },
  { name: "Vitaminas", nutrients: vitamins },
  { name: "Minerais", nutrients: minerals },
];

// Consumo diário de cada nutriente nas mesmas datas de activityHistory. O último dia é
// o consumo de "hoje" mostrado na página Nutrientes; os anteriores variam ±25% em torno dele.
export const nutrientHistory = activityHistory.map(({ date }, i) => {
  const values: Record<string, number> = {};
  nutrientGroups
    .flatMap((group) => group.nutrients)
    .forEach(({ name, atual, meta }, k) => {
      if (i === activityHistory.length - 1) {
        values[name] = atual;
        return;
      }
      const value = atual * (0.75 + seeded(i * 13 + k * 101 + 700) * 0.5);
      values[name] = meta < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    });
  return { date, values };
});

// Pesagens simuladas nos 90 dias ANTES do primeiro peso real do usuário, perdendo de 0,5 a
// 1 kg por semana até chegar nele. Só aparecem no gráfico; nada disso é salvo no localStorage.
export function mockWeightHistory(firstRealEntry: WeightEntry): WeightEntry[] {
  const entries: WeightEntry[] = [];
  const at = new Date(firstRealEntry.at);
  let kg = firstRealEntry.kg;
  let daysBack = 0;

  for (let i = 0; daysBack < 90; i++) {
    // Pesagens a cada 3 ou 4 dias (cerca de duas por semana), de manhã.
    const step = i % 2 === 0 ? 3 : 4;
    daysBack += step;
    const weeklyLoss = 0.5 + seeded(i + 900) * 0.5;
    kg += (weeklyLoss * step) / 7;

    const date = new Date(at);
    date.setDate(date.getDate() - daysBack);
    date.setHours(6 + Math.floor(seeded(i + 950) * 3), Math.floor(seeded(i + 980) * 60), 0, 0);
    entries.unshift({ id: `mock-${i}`, at: date.toISOString(), kg: Math.round(kg * 10) / 10 });
  }
  return entries;
}

export const activitySources = [
  { name: "Google Fit", platform: "Android", connected: true, lastSync: "21/09/2026 às 22:14" },
  { name: "Apple Saúde", platform: "iOS", connected: false, lastSync: null },
];

export const planHistory: {
  date: string;
  meals: { time: string; title: string; kcal: number; followed: boolean }[];
  flaggedFoods: { name: string; feedback: FoodFeedback }[];
}[] = [
  {
    date: "2026-09-21",
    meals: [
      { time: "07:30", title: "Torrada de Abacate com Ovo Poché", kcal: 350, followed: true },
      { time: "12:30", title: "Tacos de Camarão Grelhado com Salsa de Manga", kcal: 375, followed: true },
      { time: "16:00", title: "Iogurte Grego com Frutas Vermelhas", kcal: 180, followed: false },
      { time: "20:00", title: "Bowl de Salmão com Quinoa e Legumes", kcal: 435, followed: true },
    ],
    flaggedFoods: [{ name: "Guacamole", feedback: "nao-quero" }],
  },
  {
    date: "2026-09-20",
    meals: [
      { time: "07:30", title: "Panqueca de Aveia com Banana", kcal: 380, followed: true },
      { time: "12:30", title: "Frango Grelhado com Arroz Integral", kcal: 520, followed: true },
      { time: "16:00", title: "Mix de Castanhas", kcal: 190, followed: true },
      { time: "20:00", title: "Omelete de Espinafre com Salada", kcal: 340, followed: true },
    ],
    flaggedFoods: [],
  },
  {
    date: "2026-09-19",
    meals: [
      { time: "07:30", title: "Vitamina de Morango com Whey", kcal: 310, followed: true },
      { time: "12:30", title: "Peixe Assado com Batata-Doce", kcal: 480, followed: false },
      { time: "16:00", title: "Maçã com Pasta de Amendoim", kcal: 210, followed: true },
      { time: "20:00", title: "Sopa de Legumes com Frango", kcal: 360, followed: false },
    ],
    flaggedFoods: [
      { name: "Batata-doce", feedback: "nao-tenho" },
      { name: "Chuchu", feedback: "nao-gosto" },
    ],
  },
  {
    date: "2026-09-18",
    meals: [
      { time: "07:30", title: "Tapioca com Queijo Branco", kcal: 330, followed: true },
      { time: "12:30", title: "Carne Moída com Abobrinha e Arroz", kcal: 540, followed: true },
      { time: "16:00", title: "Iogurte Natural com Granola", kcal: 220, followed: true },
      { time: "20:00", title: "Wrap de Atum com Folhas", kcal: 390, followed: false },
    ],
    flaggedFoods: [{ name: "Atum em lata", feedback: "nao-gosto" }],
  },
  {
    date: "2026-09-17",
    meals: [
      { time: "07:30", title: "Ovos Mexidos com Pão Integral", kcal: 360, followed: true },
      { time: "12:30", title: "Strogonoff de Frango Light", kcal: 510, followed: true },
      { time: "16:00", title: "Banana com Aveia", kcal: 170, followed: true },
      { time: "20:00", title: "Salada de Grão-de-Bico", kcal: 380, followed: true },
    ],
    flaggedFoods: [],
  },
];
