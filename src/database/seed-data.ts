// Semente do banco: plano base, sugestões de refeição e nutrientes acompanhados. Os alimentos vêm do
// catálogo (TACO); aqui só entram nome e gramas, e o seed calcula os nutrientes de cada porção.
import type { MealPeriod } from '../plan/engine/types.js';

/** Alimento numa porção, pelo nome exato no catálogo. */
export type FoodPortionSeed = { name: string; grams: number };

/**
 * Plano base: as refeições com que o usuário começa, nas porções de referência (~1150 kcal nas 3
 * principais). O plano do usuário escala as porções para a meta calórica dele.
 */
export const baseMeals: {
  id: number;
  title: string;
  time: string;
  /** Entra a partir de quantas refeições por dia (sem o campo: sempre). */
  minMealsPerDay?: number;
  foods: FoodPortionSeed[];
}[] = [
  {
    id: 1,
    title: 'Pão Integral com Ovo, Queijo e Mamão',
    time: '07:30',
    foods: [
      { name: 'Pão, trigo, forma, integral', grams: 50 },
      { name: 'Ovo, de galinha, inteiro, cozido/10minutos', grams: 50 },
      { name: 'Queijo, minas, frescal', grams: 30 },
      { name: 'Mamão, Papaia, cru', grams: 150 },
      { name: 'Café, infusão 10%', grams: 100 },
    ],
  },
  {
    id: 2,
    title: 'Arroz, Feijão e Frango Grelhado com Salada',
    time: '12:30',
    foods: [
      { name: 'Arroz, integral, cozido', grams: 100 },
      { name: 'Feijão, carioca, cozido', grams: 80 },
      { name: 'Frango, peito, sem pele, grelhado', grams: 100 },
      { name: 'Alface, crespa, crua', grams: 30 },
      { name: 'Tomate, com semente, cru', grams: 50 },
      { name: 'Azeite, de oliva, extra virgem', grams: 5 },
    ],
  },
  {
    id: 3,
    title: 'Salmão Grelhado com Batata-Doce e Legumes',
    time: '20:00',
    foods: [
      { name: 'Salmão, sem pele, fresco, grelhado', grams: 100 },
      { name: 'Batata, doce, cozida', grams: 100 },
      { name: 'Brócolis, cozido', grams: 80 },
      { name: 'Cenoura, cozida', grams: 50 },
      { name: 'Azeite, de oliva, extra virgem', grams: 5 },
    ],
  },
  // Lanches: entram no plano inicial conforme as refeições por dia escolhidas no perfil.
  {
    id: 4,
    title: 'Lanche da Tarde: Iogurte com Banana e Aveia',
    time: '16:00',
    minMealsPerDay: 4,
    foods: [
      { name: 'Iogurte, natural', grams: 170 },
      { name: 'Banana, prata, crua', grams: 80 },
      { name: 'Aveia, flocos, crua', grams: 15 },
    ],
  },
  {
    id: 5,
    title: 'Lanche da Manhã: Laranja com Amendoim',
    time: '10:00',
    minMealsPerDay: 5,
    foods: [
      { name: 'Laranja, pêra, crua', grams: 150 },
      { name: 'Amendoim, torrado, salgado', grams: 15 },
    ],
  },
  {
    id: 6,
    title: 'Ceia: Iogurte com Kiwi',
    time: '22:00',
    minMealsPerDay: 6,
    foods: [
      { name: 'Iogurte, natural', grams: 120 },
      { name: 'Kiwi, cru', grams: 80 },
    ],
  },
];

/** Refeições que o assistente sugere (criar refeição e "sugerir uma nova"), na ordem de preferência. */
export const mealSuggestions: {
  title: string;
  periods: MealPeriod[];
  foods: FoodPortionSeed[];
}[] = [
  {
    title: 'Iogurte Natural com Aveia, Morangos e Mel',
    periods: ['manha', 'tarde'],
    foods: [
      { name: 'Iogurte, natural', grams: 170 },
      { name: 'Aveia, flocos, crua', grams: 30 },
      { name: 'Morango, cru', grams: 100 },
      { name: 'Mel, de abelha', grams: 10 },
    ],
  },
  {
    title: 'Patinho Grelhado com Arroz e Abobrinha',
    periods: ['tarde', 'noite'],
    foods: [
      { name: 'Carne, bovina, patinho, sem gordura, grelhado', grams: 100 },
      { name: 'Arroz, tipo 1, cozido', grams: 100 },
      { name: 'Abobrinha, italiana, refogada', grams: 80 },
    ],
  },
  {
    title: 'Cuscuz Nordestino com Ovo e Queijo',
    periods: ['manha', 'noite'],
    foods: [
      { name: 'Cuscuz, de milho, cozido com sal', grams: 120 },
      { name: 'Ovo, de galinha, inteiro, cozido/10minutos', grams: 50 },
      { name: 'Queijo, minas, frescal', grams: 30 },
    ],
  },
  {
    title: 'Banana com Aveia e Amendoim',
    periods: ['manha', 'tarde'],
    foods: [
      { name: 'Banana, prata, crua', grams: 100 },
      { name: 'Aveia, flocos, crua', grams: 20 },
      { name: 'Amendoim, torrado, salgado', grams: 15 },
    ],
  },
  {
    title: 'Sanduíche Integral de Atum',
    periods: ['tarde'],
    foods: [
      { name: 'Pão, trigo, forma, integral', grams: 50 },
      { name: 'Atum, conserva em óleo', grams: 60 },
      { name: 'Alface, crespa, crua', grams: 20 },
      { name: 'Tomate, com semente, cru', grams: 40 },
    ],
  },
  {
    title: 'Frutas com Castanha-do-Brasil',
    periods: ['manha', 'tarde'],
    foods: [
      { name: 'Maçã, Fuji, com casca, crua', grams: 130 },
      { name: 'Kiwi, cru', grams: 80 },
      { name: 'Castanha-do-Brasil, crua', grams: 10 },
    ],
  },
  {
    title: 'Sardinha Assada com Mandioca e Couve',
    periods: ['tarde', 'noite'],
    foods: [
      { name: 'Sardinha, assada', grams: 100 },
      { name: 'Mandioca, cozida', grams: 100 },
      { name: 'Couve, manteiga, refogada', grams: 50 },
    ],
  },
  {
    title: 'Lentilha com Arroz Integral e Legumes',
    periods: ['tarde', 'noite'],
    foods: [
      { name: 'Lentilha, cozida', grams: 100 },
      { name: 'Arroz, integral, cozido', grams: 100 },
      { name: 'Cenoura, cozida', grams: 50 },
      { name: 'Abobrinha, italiana, refogada', grams: 50 },
    ],
  },
  {
    title: 'Pão Francês com Queijo e Café',
    periods: ['manha', 'tarde'],
    foods: [
      { name: 'Pão, trigo, francês', grams: 50 },
      { name: 'Queijo, minas, frescal', grams: 30 },
      { name: 'Café, infusão 10%', grams: 100 },
    ],
  },
  {
    title: 'Músculo Cozido com Batata e Legumes',
    periods: ['noite'],
    foods: [
      { name: 'Carne, bovina, músculo, sem gordura, cozido', grams: 100 },
      { name: 'Batata, inglesa, cozida', grams: 100 },
      { name: 'Cenoura, cozida', grams: 50 },
      { name: 'Chuchu, cozido', grams: 50 },
    ],
  },
];

type NutrientSeed = {
  id: string;
  name: string;
  unit: string;
  meta: number;
  limit?: boolean;
  section: 'macros' | 'fibers' | 'otherMacros' | 'vitamins' | 'minerals';
  groupName: string;
};

/**
 * Nutrientes acompanhados: só os que a TACO mede (ver `sources/taco/to-catalog.ts`), com metas diárias
 * de referência (DRIs para adultos). As metas dos macronutrientes são recalculadas a partir da meta
 * calórica do usuário quando ele tem perfil.
 */
export const nutrientDefs: NutrientSeed[] = [
  {
    id: 'proteinas',
    name: 'Proteínas',
    unit: 'g',
    meta: 150,
    section: 'macros',
    groupName: 'Macronutrientes',
  },
  {
    id: 'gorduras',
    name: 'Gorduras',
    unit: 'g',
    meta: 70,
    section: 'macros',
    groupName: 'Macronutrientes',
  },
  {
    id: 'carboidratos',
    name: 'Carboidratos',
    unit: 'g',
    meta: 250,
    section: 'macros',
    groupName: 'Macronutrientes',
  },
  {
    id: 'fibras',
    name: 'Fibras',
    unit: 'g',
    meta: 30,
    section: 'fibers',
    groupName: 'Macronutrientes',
  },
  {
    id: 'gordura-saturada',
    name: 'Gordura saturada',
    unit: 'g',
    meta: 20,
    limit: true,
    section: 'otherMacros',
    groupName: 'Macronutrientes',
  },
  {
    id: 'colesterol',
    name: 'Colesterol',
    unit: 'mg',
    meta: 300,
    limit: true,
    section: 'otherMacros',
    groupName: 'Macronutrientes',
  },
  {
    id: 'vitamina-a',
    name: 'Vitamina A',
    unit: 'µg',
    meta: 900,
    section: 'vitamins',
    groupName: 'Vitaminas',
  },
  {
    id: 'tiamina',
    name: 'Tiamina (B1)',
    unit: 'mg',
    meta: 1.2,
    section: 'vitamins',
    groupName: 'Vitaminas',
  },
  {
    id: 'riboflavina',
    name: 'Riboflavina (B2)',
    unit: 'mg',
    meta: 1.3,
    section: 'vitamins',
    groupName: 'Vitaminas',
  },
  {
    id: 'niacina',
    name: 'Niacina (B3)',
    unit: 'mg',
    meta: 16,
    section: 'vitamins',
    groupName: 'Vitaminas',
  },
  {
    id: 'piridoxina',
    name: 'Piridoxina (B6)',
    unit: 'mg',
    meta: 1.3,
    section: 'vitamins',
    groupName: 'Vitaminas',
  },
  {
    id: 'vitamina-c',
    name: 'Vitamina C',
    unit: 'mg',
    meta: 90,
    section: 'vitamins',
    groupName: 'Vitaminas',
  },
  {
    id: 'calcio',
    name: 'Cálcio',
    unit: 'mg',
    meta: 1000,
    section: 'minerals',
    groupName: 'Minerais',
  },
  {
    id: 'ferro',
    name: 'Ferro',
    unit: 'mg',
    meta: 8,
    section: 'minerals',
    groupName: 'Minerais',
  },
  {
    id: 'magnesio',
    name: 'Magnésio',
    unit: 'mg',
    meta: 420,
    section: 'minerals',
    groupName: 'Minerais',
  },
  {
    id: 'manganes',
    name: 'Manganês',
    unit: 'mg',
    meta: 2.3,
    section: 'minerals',
    groupName: 'Minerais',
  },
  {
    id: 'fosforo',
    name: 'Fósforo',
    unit: 'mg',
    meta: 700,
    section: 'minerals',
    groupName: 'Minerais',
  },
  {
    id: 'potassio',
    name: 'Potássio',
    unit: 'mg',
    meta: 3400,
    section: 'minerals',
    groupName: 'Minerais',
  },
  {
    id: 'sodio',
    name: 'Sódio',
    unit: 'mg',
    meta: 2000,
    limit: true,
    section: 'minerals',
    groupName: 'Minerais',
  },
  {
    id: 'cobre',
    name: 'Cobre',
    unit: 'mg',
    meta: 0.9,
    section: 'minerals',
    groupName: 'Minerais',
  },
  {
    id: 'zinco',
    name: 'Zinco',
    unit: 'mg',
    meta: 11,
    section: 'minerals',
    groupName: 'Minerais',
  },
];
