import type { PlanVersionMeal } from '../database/entities/index.js';
import { nextPlanVersion, planChanges } from './plan-versions.js';

const meal = (
  id: number,
  foods: [string, number][],
  title = `Refeição ${id}`,
): PlanVersionMeal => ({
  id,
  title,
  time: '12:00',
  kcal: 500,
  foods: foods.map(([name, grams]) => ({ name, grams })),
});

describe('nextPlanVersion', () => {
  const montado = { fingerprint: 'a', edited: false, date: '2026-10-26' };
  const alterado = { fingerprint: 'b', edited: true, date: '2026-10-26' };

  it('sem versão grava a montada', () => {
    expect(nextPlanVersion(null, null, 'a', '2026-10-26')).toBe('insert');
  });

  it('plano igual ao último não grava nada', () => {
    expect(nextPlanVersion(montado, null, 'a', '2026-10-26')).toBe('none');
    expect(nextPlanVersion(alterado, montado, 'b', '2026-10-26')).toBe('none');
  });

  it('a montada nunca é editada: a primeira mudança cria a alterada do dia', () => {
    expect(nextPlanVersion(montado, null, 'b', '2026-10-26')).toBe('insert');
  });

  it('mais mudanças no mesmo dia editam a alterada do dia', () => {
    expect(nextPlanVersion(alterado, montado, 'c', '2026-10-26')).toBe(
      'update',
    );
  });

  it('desfazer no mesmo dia tudo o que mudou apaga a alterada do dia', () => {
    expect(nextPlanVersion(alterado, montado, 'a', '2026-10-26')).toBe(
      'delete',
    );
  });

  it('mudança em outro dia cria outra alterada', () => {
    expect(nextPlanVersion(alterado, montado, 'c', '2026-10-27')).toBe(
      'insert',
    );
  });
});

describe('planChanges', () => {
  it('sem mudança nos alimentos, nada (o horário não conta)', () => {
    const before = [meal(1, [['Pão', 50]])];
    const after = [{ ...meal(1, [['Pão', 50]]), time: '08:00' }];
    expect(planChanges(before, after)).toEqual([]);
  });

  it('troca, acréscimo, remoção e gramas', () => {
    const before = [
      meal(1, [
        ['Pão', 50],
        ['Mamão', 150],
      ]),
      meal(2, [
        ['Arroz', 120],
        ['Cenoura', 80],
      ]),
    ];
    const after = [
      meal(1, [
        ['Tapioca', 60],
        ['Mamão', 150],
        ['Banana', 100],
      ]),
      meal(2, [['Arroz', 150]]),
    ];
    expect(planChanges(before, after)).toEqual([
      {
        meal: 'Refeição 1',
        kind: 'swap',
        from: { name: 'Pão', grams: 50 },
        to: { name: 'Tapioca', grams: 60 },
      },
      {
        meal: 'Refeição 1',
        kind: 'added',
        from: null,
        to: { name: 'Banana', grams: 100 },
      },
      {
        meal: 'Refeição 2',
        kind: 'removed',
        from: { name: 'Cenoura', grams: 80 },
        to: null,
      },
      {
        meal: 'Refeição 2',
        kind: 'grams',
        from: { name: 'Arroz', grams: 120 },
        to: { name: 'Arroz', grams: 150 },
      },
    ]);
  });

  it('duas trocas na mesma refeição saem na ordem', () => {
    const before = [
      meal(1, [
        ['Pão', 50],
        ['Queijo', 40],
      ]),
    ];
    const after = [
      meal(1, [
        ['Tapioca', 60],
        ['Ricota', 50],
      ]),
    ];
    expect(
      planChanges(before, after).map((change) => [
        change.kind,
        change.from?.name,
        change.to?.name,
      ]),
    ).toEqual([
      ['swap', 'Pão', 'Tapioca'],
      ['swap', 'Queijo', 'Ricota'],
    ]);
  });
});
