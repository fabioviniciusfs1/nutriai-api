import { parseTaco, TACO_COLUMNS, type TacoFood } from './parse.js';
import { tacoToCatalog } from './to-catalog.js';

function food(
  id: number,
  categoria: string,
  values: Partial<TacoFood>,
): TacoFood {
  const base = Object.fromEntries(TACO_COLUMNS.map((column) => [column, null]));
  return {
    ...base,
    id,
    nome: `Alimento ${id}`,
    categoria,
    ...values,
  } as TacoFood;
}

describe('tacoToCatalog', () => {
  it('converte macros, grupo e micronutrientes', () => {
    const item = tacoToCatalog(
      food(1, 'Cereais e derivados', {
        energia_kcal: 124,
        proteina_g: 2.6,
        lipideos_g: 1,
        carboidrato_g: 25.8,
        fibra_alimentar_g: 2.7,
        riboflavina_mg: 0,
        vitamina_c_mg: null,
        retinol_mcg: 10,
      }),
    );
    expect(item).toEqual({
      name: 'Alimento 1',
      group: 'carboidratos',
      per100g: { kcal: 124, protein: 2.6, fat: 1, carbs: 25.8 },
      animal: [],
      microsPer100g: { fibras: 2.7, riboflavina: 0, 'vitamina-a': 10 },
      source: 'taco',
      sourceId: 1,
    });
  });

  it('macro sem valor vale 0; sem energia fica fora; categorias sem grupo', () => {
    expect(
      tacoToCatalog(
        food(260, 'Gorduras e óleos', { energia_kcal: 884, lipideos_g: 100 }),
      ),
    ).toMatchObject({
      group: 'gorduras',
      per100g: { kcal: 884, protein: 0, fat: 100, carbs: 0 },
    });
    expect(tacoToCatalog(food(458, 'Leite e derivados', {}))).toBeNull();
    expect(
      tacoToCatalog(food(480, 'Bebidas', { energia_kcal: 40 }))?.group,
    ).toBeNull();
    expect(
      tacoToCatalog(food(560, 'Leguminosas e derivados', { energia_kcal: 70 }))
        ?.group,
    ).toBe('proteinas');
  });

  it('prefere RAE ao retinol na vitamina A', () => {
    const item = tacoToCatalog(
      food(64, 'Verduras, hortaliças e derivados', {
        energia_kcal: 20,
        rae_mcg: 50,
        retinol_mcg: 5,
      }),
    );
    expect(item?.microsPer100g['vitamina-a']).toBe(50);
  });
});

describe('parse + catálogo', () => {
  it('funciona em conjunto', () => {
    const { foods } = parseTaco([
      {
        name: 'pag1',
        rows: [
          ['id', 'nome', ...TACO_COLUMNS.slice(0, 25)],
          ['1', 'Arroz', '124'],
        ],
      },
      { name: 'pag2', rows: [['id', 'nome', ...TACO_COLUMNS.slice(25)]] },
    ]);
    expect(tacoToCatalog(foods[0])?.per100g.kcal).toBe(124);
  });
});
