// Catálogo fixo dos testes do engine: os dados de exemplo do front antigo (`backend-contract/reference/mock-data.ts`).
// Mantém as regras do plano testadas sem depender da TACO.
import type { FoodGroup } from '../../contract.js';
import type { AnimalTag } from './diet.js';
import type { Catalog, MealPeriod, PlanFood } from './types.js';

/** Plano base: as refeições com que todo usuário começa. */
export const testBaseMeals: {
  id: number;
  title: string;
  time: string;
  minMealsPerDay?: number;
  foods: PlanFood[];
}[] = [
  {
    id: 1,
    title: 'Torrada de Abacate com Ovo Poché',
    time: '07:30',
    foods: [
      {
        name: 'Pão integral',
        grams: 50,
        carbs: 24,
        protein: 6,
        fat: 2,
        kcal: 140,
      },
      { name: 'Abacate', grams: 50, carbs: 4, protein: 1, fat: 10, kcal: 100 },
      { name: 'Ovo poché', grams: 50, carbs: 1, protein: 6, fat: 5, kcal: 70 },
      {
        name: 'Azeite de oliva',
        grams: 5,
        carbs: 0,
        protein: 0,
        fat: 5,
        kcal: 40,
      },
    ],
  },
  {
    id: 2,
    title: 'Tacos de Camarão Grelhado com Salsa de Manga',
    time: '12:30',
    foods: [
      {
        name: 'Tortilha integral',
        grams: 60,
        carbs: 22,
        protein: 5,
        fat: 3,
        kcal: 130,
      },
      {
        name: 'Camarão grelhado',
        grams: 120,
        carbs: 0,
        protein: 20,
        fat: 2,
        kcal: 110,
      },
      {
        name: 'Salsa de manga',
        grams: 80,
        carbs: 15,
        protein: 1,
        fat: 0,
        kcal: 65,
      },
      { name: 'Guacamole', grams: 30, carbs: 1, protein: 0, fat: 7, kcal: 65 },
      { name: 'Limão', grams: 20, carbs: 0, protein: 0, fat: 0, kcal: 5 },
    ],
  },
  {
    id: 3,
    title: 'Bowl de Salmão com Quinoa e Legumes',
    time: '20:00',
    foods: [
      {
        name: 'Salmão grelhado',
        grams: 130,
        carbs: 0,
        protein: 26,
        fat: 12,
        kcal: 220,
      },
      {
        name: 'Quinoa cozida',
        grams: 100,
        carbs: 21,
        protein: 4,
        fat: 2,
        kcal: 120,
      },
      {
        name: 'Brócolis no vapor',
        grams: 80,
        carbs: 6,
        protein: 3,
        fat: 0,
        kcal: 35,
      },
      { name: 'Cenoura', grams: 50, carbs: 5, protein: 1, fat: 0, kcal: 20 },
      {
        name: 'Azeite de oliva',
        grams: 5,
        carbs: 0,
        protein: 0,
        fat: 5,
        kcal: 40,
      },
    ],
  },
  // Lanches: entram no plano inicial conforme as refeições por dia do perfil.
  {
    id: 4,
    title: 'Lanche da Tarde: Iogurte com Banana',
    time: '16:00',
    minMealsPerDay: 4,
    foods: [
      {
        name: 'Iogurte grego natural',
        grams: 100,
        carbs: 4,
        protein: 9,
        fat: 4,
        kcal: 88,
      },
      {
        name: 'Banana-prata',
        grams: 60,
        carbs: 16,
        protein: 1,
        fat: 0,
        kcal: 60,
      },
    ],
  },
  {
    id: 5,
    title: 'Lanche da Manhã: Maçã',
    time: '10:00',
    minMealsPerDay: 5,
    foods: [
      { name: 'Maçã', grams: 150, carbs: 23, protein: 0, fat: 0, kcal: 84 },
    ],
  },
  {
    id: 6,
    title: 'Ceia: Kefir',
    time: '22:00',
    minMealsPerDay: 6,
    foods: [
      { name: 'Kefir', grams: 200, carbs: 10, protein: 6, fat: 6, kcal: 120 },
    ],
  },
];

/** Catálogo de alimentos com nutrientes por 100 g. Todo alimento do plano e das sugestões precisa estar aqui. */
export const testFoods: {
  name: string;
  group: FoodGroup;
  per100g: { carbs: number; protein: number; fat: number; kcal: number };
  animal?: AnimalTag[];
}[] = [
  {
    name: 'Pão integral',
    group: 'carboidratos',
    per100g: { carbs: 48, protein: 12, fat: 4, kcal: 280 },
  },
  {
    name: 'Tortilha integral',
    group: 'carboidratos',
    per100g: { carbs: 37, protein: 8, fat: 5, kcal: 217 },
  },
  {
    name: 'Quinoa cozida',
    group: 'carboidratos',
    per100g: { carbs: 21, protein: 4, fat: 2, kcal: 120 },
  },
  {
    name: 'Arroz integral',
    group: 'carboidratos',
    per100g: { carbs: 23, protein: 3, fat: 1, kcal: 110 },
  },
  {
    name: 'Batata-doce cozida',
    group: 'carboidratos',
    per100g: { carbs: 20, protein: 2, fat: 0, kcal: 87 },
  },
  {
    name: 'Granola sem açúcar',
    group: 'carboidratos',
    per100g: { carbs: 63, protein: 10, fat: 13, kcal: 417 },
  },
  {
    name: 'Aveia em flocos',
    group: 'carboidratos',
    per100g: { carbs: 60, protein: 13, fat: 7, kcal: 367 },
  },
  {
    name: 'Tapioca',
    group: 'carboidratos',
    per100g: { carbs: 59, protein: 0, fat: 0, kcal: 240 },
  },
  {
    name: 'Cuscuz de milho',
    group: 'carboidratos',
    per100g: { carbs: 25, protein: 2, fat: 1, kcal: 112 },
  },
  {
    name: 'Mandioca cozida',
    group: 'carboidratos',
    per100g: { carbs: 30, protein: 1, fat: 0, kcal: 125 },
  },

  {
    name: 'Ovo poché',
    group: 'proteinas',
    per100g: { carbs: 1, protein: 13, fat: 10, kcal: 143 },
    animal: ['ovo'],
  },
  {
    name: 'Ovos',
    group: 'proteinas',
    per100g: { carbs: 1, protein: 13, fat: 10, kcal: 143 },
    animal: ['ovo'],
  },
  {
    name: 'Camarão grelhado',
    group: 'proteinas',
    per100g: { carbs: 0, protein: 17, fat: 2, kcal: 92 },
    animal: ['pescado'],
  },
  {
    name: 'Salmão grelhado',
    group: 'proteinas',
    per100g: { carbs: 0, protein: 20, fat: 9, kcal: 170 },
    animal: ['pescado'],
  },
  {
    name: 'Peito de frango grelhado',
    group: 'proteinas',
    per100g: { carbs: 0, protein: 30, fat: 3, kcal: 159 },
    animal: ['carne'],
  },
  {
    name: 'Tilápia assada',
    group: 'proteinas',
    per100g: { carbs: 0, protein: 20, fat: 3, kcal: 107 },
    animal: ['pescado'],
  },
  {
    name: 'Atum em água',
    group: 'proteinas',
    per100g: { carbs: 0, protein: 26, fat: 1, kcal: 116 },
    animal: ['pescado'],
  },
  {
    name: 'Patinho moído',
    group: 'proteinas',
    per100g: { carbs: 0, protein: 36, fat: 7, kcal: 219 },
    animal: ['carne'],
  },
  {
    name: 'Tofu',
    group: 'proteinas',
    per100g: { carbs: 2, protein: 8, fat: 4, kcal: 76 },
  },

  {
    name: 'Iogurte grego natural',
    group: 'laticinios',
    per100g: { carbs: 4, protein: 9, fat: 4, kcal: 88 },
    animal: ['leite'],
  },
  {
    name: 'Queijo branco',
    group: 'laticinios',
    per100g: { carbs: 3, protein: 17, fat: 14, kcal: 216 },
    animal: ['leite'],
  },
  {
    name: 'Ricota',
    group: 'laticinios',
    per100g: { carbs: 4, protein: 11, fat: 8, kcal: 140 },
    animal: ['leite'],
  },
  {
    name: 'Queijo cottage',
    group: 'laticinios',
    per100g: { carbs: 3, protein: 11, fat: 4, kcal: 98 },
    animal: ['leite'],
  },
  {
    name: 'Kefir',
    group: 'laticinios',
    per100g: { carbs: 5, protein: 3, fat: 3, kcal: 60 },
    animal: ['leite'],
  },

  {
    name: 'Abacate',
    group: 'gorduras',
    per100g: { carbs: 8, protein: 2, fat: 20, kcal: 200 },
  },
  {
    name: 'Azeite de oliva',
    group: 'gorduras',
    per100g: { carbs: 0, protein: 0, fat: 100, kcal: 800 },
  },
  {
    name: 'Guacamole',
    group: 'gorduras',
    per100g: { carbs: 3, protein: 1, fat: 23, kcal: 217 },
  },
  {
    name: 'Pasta de amendoim integral',
    group: 'gorduras',
    per100g: { carbs: 20, protein: 27, fat: 47, kcal: 600 },
  },
  {
    name: 'Mix de castanhas',
    group: 'gorduras',
    per100g: { carbs: 20, protein: 18, fat: 52, kcal: 600 },
  },
  {
    name: 'Semente de chia',
    group: 'gorduras',
    per100g: { carbs: 42, protein: 17, fat: 31, kcal: 490 },
  },

  {
    name: 'Salsa de manga',
    group: 'frutas',
    per100g: { carbs: 19, protein: 1, fat: 0, kcal: 81 },
  },
  {
    name: 'Morangos',
    group: 'frutas',
    per100g: { carbs: 8, protein: 1, fat: 0, kcal: 35 },
  },
  {
    name: 'Banana-prata',
    group: 'frutas',
    per100g: { carbs: 26, protein: 1, fat: 0, kcal: 100 },
  },
  {
    name: 'Mamão papaia',
    group: 'frutas',
    per100g: { carbs: 10, protein: 0, fat: 0, kcal: 40 },
  },
  {
    name: 'Maçã',
    group: 'frutas',
    per100g: { carbs: 15, protein: 0, fat: 0, kcal: 56 },
  },
  {
    name: 'Kiwi',
    group: 'frutas',
    per100g: { carbs: 12, protein: 1, fat: 0, kcal: 51 },
  },

  {
    name: 'Brócolis no vapor',
    group: 'vegetais',
    per100g: { carbs: 7, protein: 4, fat: 0, kcal: 44 },
  },
  {
    name: 'Cenoura',
    group: 'vegetais',
    per100g: { carbs: 10, protein: 2, fat: 0, kcal: 40 },
  },
  {
    name: 'Salada de folhas e tomate',
    group: 'vegetais',
    per100g: { carbs: 5, protein: 1, fat: 0, kcal: 25 },
  },
  {
    name: 'Espinafre refogado',
    group: 'vegetais',
    per100g: { carbs: 4, protein: 2, fat: 0, kcal: 30 },
  },
  {
    name: 'Abobrinha refogada',
    group: 'vegetais',
    per100g: { carbs: 4, protein: 1, fat: 0, kcal: 25 },
  },
  {
    name: 'Couve-flor cozida',
    group: 'vegetais',
    per100g: { carbs: 4, protein: 2, fat: 0, kcal: 23 },
  },
  {
    name: 'Vagem cozida',
    group: 'vegetais',
    per100g: { carbs: 6, protein: 2, fat: 0, kcal: 30 },
  },

  {
    name: 'Mel',
    group: 'adocantes',
    per100g: { carbs: 82, protein: 0, fat: 0, kcal: 300 },
  },
  {
    name: 'Geleia sem açúcar',
    group: 'adocantes',
    per100g: { carbs: 38, protein: 0, fat: 0, kcal: 150 },
  },
  {
    name: 'Tâmara',
    group: 'adocantes',
    per100g: { carbs: 75, protein: 2, fat: 0, kcal: 280 },
  },

  {
    name: 'Limão',
    group: 'acidos',
    per100g: { carbs: 8, protein: 0, fat: 0, kcal: 25 },
  },
  {
    name: 'Vinagre de maçã',
    group: 'acidos',
    per100g: { carbs: 1, protein: 0, fat: 0, kcal: 20 },
  },
  {
    name: 'Suco de laranja',
    group: 'acidos',
    per100g: { carbs: 10, protein: 1, fat: 0, kcal: 45 },
  },
];

/** Refeições que o assistente sugere (criar refeição e "sugerir uma nova"), na ordem de preferência. */
export const testSuggestions: {
  title: string;
  periods: MealPeriod[];
  foods: PlanFood[];
}[] = [
  {
    title: 'Iogurte Grego com Granola e Morangos',
    periods: ['manha', 'tarde'],
    foods: [
      {
        name: 'Iogurte grego natural',
        grams: 170,
        carbs: 7,
        protein: 15,
        fat: 7,
        kcal: 150,
      },
      {
        name: 'Granola sem açúcar',
        grams: 30,
        carbs: 19,
        protein: 3,
        fat: 4,
        kcal: 125,
      },
      { name: 'Morangos', grams: 100, carbs: 8, protein: 1, fat: 0, kcal: 35 },
      { name: 'Mel', grams: 7, carbs: 6, protein: 0, fat: 0, kcal: 20 },
    ],
  },
  {
    title: 'Frango Grelhado com Arroz Integral e Salada',
    periods: ['tarde', 'noite'],
    foods: [
      {
        name: 'Peito de frango grelhado',
        grams: 120,
        carbs: 0,
        protein: 36,
        fat: 4,
        kcal: 190,
      },
      {
        name: 'Arroz integral',
        grams: 100,
        carbs: 23,
        protein: 3,
        fat: 1,
        kcal: 110,
      },
      {
        name: 'Salada de folhas e tomate',
        grams: 80,
        carbs: 4,
        protein: 1,
        fat: 0,
        kcal: 20,
      },
      {
        name: 'Azeite de oliva',
        grams: 5,
        carbs: 0,
        protein: 0,
        fat: 5,
        kcal: 40,
      },
    ],
  },
  {
    title: 'Omelete de Espinafre com Pão Integral',
    periods: ['manha', 'noite'],
    foods: [
      { name: 'Ovos', grams: 100, carbs: 1, protein: 12, fat: 10, kcal: 140 },
      {
        name: 'Espinafre refogado',
        grams: 50,
        carbs: 2,
        protein: 1,
        fat: 0,
        kcal: 15,
      },
      {
        name: 'Queijo branco',
        grams: 30,
        carbs: 1,
        protein: 5,
        fat: 4,
        kcal: 65,
      },
      {
        name: 'Pão integral',
        grams: 25,
        carbs: 12,
        protein: 3,
        fat: 1,
        kcal: 70,
      },
    ],
  },
  {
    title: 'Tilápia Assada com Batata-Doce e Brócolis',
    periods: ['tarde', 'noite'],
    foods: [
      {
        name: 'Tilápia assada',
        grams: 150,
        carbs: 0,
        protein: 30,
        fat: 4,
        kcal: 160,
      },
      {
        name: 'Batata-doce cozida',
        grams: 120,
        carbs: 24,
        protein: 2,
        fat: 0,
        kcal: 105,
      },
      {
        name: 'Brócolis no vapor',
        grams: 80,
        carbs: 6,
        protein: 3,
        fat: 0,
        kcal: 35,
      },
      {
        name: 'Azeite de oliva',
        grams: 5,
        carbs: 0,
        protein: 0,
        fat: 5,
        kcal: 40,
      },
    ],
  },
  {
    title: 'Banana com Pasta de Amendoim e Aveia',
    periods: ['manha', 'tarde'],
    foods: [
      {
        name: 'Banana-prata',
        grams: 90,
        carbs: 23,
        protein: 1,
        fat: 0,
        kcal: 90,
      },
      {
        name: 'Pasta de amendoim integral',
        grams: 15,
        carbs: 3,
        protein: 4,
        fat: 7,
        kcal: 90,
      },
      {
        name: 'Aveia em flocos',
        grams: 15,
        carbs: 9,
        protein: 2,
        fat: 1,
        kcal: 55,
      },
    ],
  },
];

export const testCatalog: Catalog = {
  foods: testFoods,
  suggestions: testSuggestions,
  baseMeals: testBaseMeals,
};
