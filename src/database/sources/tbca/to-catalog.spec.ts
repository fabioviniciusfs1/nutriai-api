import { TBCA_COLUMNS, type TbcaFood } from './parse.js';
import { tbcaToCatalog } from './to-catalog.js';

function food(
  id: string,
  categoria: string,
  values: Partial<TbcaFood>,
): TbcaFood {
  const base = Object.fromEntries(TBCA_COLUMNS.map((column) => [column, null]));
  return {
    ...base,
    id,
    nome: `Alimento ${id}`,
    categoria,
    ...values,
  } as TbcaFood;
}

describe('tbcaToCatalog', () => {
  it('converte macros (carboidrato total), grupo, origem animal e micronutrientes', () => {
    expect(
      tbcaToCatalog(
        food('C0001F', 'Carnes e derivados', {
          energia_kcal: 159,
          proteina_g: 32,
          lipideos_g: 2.5,
          carboidrato_total_g: 0,
          carboidrato_disponivel_g: 0,
          rae_mcg: 5,
          sodio_mg: 50,
          selenio_mcg: 20,
        }),
      ),
    ).toEqual({
      name: 'Alimento C0001F',
      group: 'proteinas',
      per100g: { kcal: 159, protein: 32, fat: 2.5, carbs: 0 },
      animal: ['carne'],
      microsPer100g: { 'vitamina-a': 5, sodio: 50 },
      source: 'tbca',
      sourceId: 'C0001F',
    });
  });

  it('sem energia fica fora; fast food e industrializados sem grupo; leguminosas são proteína', () => {
    expect(tbcaToCatalog(food('C0262C', 'Frutas e derivados', {}))).toBeNull();
    expect(
      tbcaToCatalog(food('C0001M', 'Fast food', { energia_kcal: 250 }))?.group,
    ).toBeNull();
    expect(
      tbcaToCatalog(
        food('C0001R', 'Outros alimentos industrializados', {
          energia_kcal: 100,
        }),
      )?.group,
    ).toBeNull();
    expect(
      tbcaToCatalog(
        food('C0001T', 'Leguminosas e derivados', { energia_kcal: 76 }),
      )?.group,
    ).toBe('proteinas');
  });
});
