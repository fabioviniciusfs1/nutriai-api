import { readFileSync } from 'node:fs';
import { parseTbca } from './parse.js';
import { tbcaToCatalog } from './to-catalog.js';

/** Confere o CSV versionado em `data/tbca/`. */
describe('data/tbca/TBCA_20223103.csv', () => {
  const { foods, warnings } = parseTbca(
    readFileSync('data/tbca/TBCA_20223103.csv', 'utf8'),
  );

  it('tem os 5.268 alimentos, sem avisos; 5.267 com energia (sem: C0262C)', () => {
    expect(foods).toHaveLength(5268);
    expect(warnings).toEqual([]);
    expect(foods.filter((food) => food.energia_kcal === null)).toMatchObject([
      { id: 'C0262C' },
    ]);
    expect(foods.map(tbcaToCatalog).filter(Boolean)).toHaveLength(5267);
  });

  it('lê os valores exibidos e os marcadores', () => {
    expect(foods.find((food) => food.id === 'C0019D')).toMatchObject({
      nome: 'Óleo, abacate, Persea americana',
      energia_kcal: 900,
      lipideos_g: 100,
      saturados_g: 20.4,
      trans_g: null,
    });
    // Nome entre aspas, com aspas dentro.
    expect(
      foods.some((food) =>
        food.nome.startsWith(
          'Bebida, café - infusão 8% - média, c/ leite (meio a meio), "média"',
        ),
      ),
    ).toBe(true);
  });
});
