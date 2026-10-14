import { readFileSync } from 'node:fs';
import { readOds } from '../ods.js';
import { parseTaco } from './parse.js';
import { buildSeedPlan } from '../../seed-plan.js';
import { tacoToCatalog } from './to-catalog.js';
import { DEFAULT_PLANNER_OPTIONS } from '../../../plan/engine/types.js';
import { MEAL_SLOTS } from '../../../users/routine.js';

/** Confere a planilha versionada em `data/taco/`. */
describe('data/taco/tabela-taco.ods', () => {
  const sheets = readOds(readFileSync('data/taco/tabela-taco.ods'));
  const { foods, warnings } = parseTaco(sheets);

  it('tem os 597 alimentos; 591 com energia (sem: 450, 457, 458, 516, 517, 591)', () => {
    expect(sheets.map((sheet) => sheet.name)).toEqual(['pag1', 'pag2']);
    expect(foods).toHaveLength(597);
    expect(foods.map(tacoToCatalog).filter(Boolean)).toHaveLength(591);
  });

  it('lê os valores exibidos e os marcadores', () => {
    const arroz = foods.find((food) => food.id === 1)!;
    expect(arroz).toMatchObject({
      nome: 'Arroz, integral, cozido',
      energia_kcal: 124,
      proteina_g: 2.6,
      riboflavina_mg: 0,
      retinol_mcg: null,
      re_mcg: null,
      vitamina_c_mg: null,
      saturados_g: 0.3,
    });
    expect(foods.find((food) => food.id === 540)?.nome).toBe('Feijoada');
  });

  it('avisa só sobre as correções conhecidas', () => {
    expect(warnings).toHaveLength(4);
    expect(warnings.join('\n')).toMatch(/,0,02/);
    expect(warnings.join('\n')).toMatch(/id 540/);
  });

  it('nomes únicos', () => {
    expect(new Set(foods.map((food) => food.nome)).size).toBe(597);
  });
});

describe('semente com a TACO', () => {
  const catalog = parseTaco(
    readOds(readFileSync('data/taco/tabela-taco.ods')),
  ).foods.flatMap((food) => tacoToCatalog(food) ?? []);

  it('todo alimento do plano base existe na TACO', () => {
    const { baseMeals } = buildSeedPlan(catalog);
    // As 3 refeições principais (os lanches e a ceia entram para quem marca na rotina).
    const dayKcal = baseMeals
      .filter((meal) => DEFAULT_PLANNER_OPTIONS.meals.includes(meal.slot))
      .flatMap((meal) => meal.foods)
      .reduce((sum, food) => sum + food.kcal, 0);
    expect(dayKcal).toBeGreaterThan(1000);
    expect(dayKcal).toBeLessThan(1300);
    // Uma refeição base para cada refeição do dia.
    expect(baseMeals.map((meal) => meal.slot).sort()).toEqual(
      [...MEAL_SLOTS].sort(),
    );
  });

  it('falha com mensagem clara sem o catálogo', () => {
    expect(() => buildSeedPlan([])).toThrow(/Importe a TACO/);
  });
});
