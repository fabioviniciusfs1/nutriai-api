import type { PlanVersionMeal } from '../database/entities/index.js';
import { appendEdits, nextPlanVersion, planChanges } from './plan-versions.js';

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
  const montagem = new Date('2026-10-26T10:00:00.000Z');
  const base = { fingerprint: 'a', assembledAt: null };
  const montado = { fingerprint: 'a', assembledAt: montagem };

  it('sem versão grava a montada', () => {
    expect(nextPlanVersion(null, 'a', null)).toBe('insert');
    expect(nextPlanVersion(null, 'a', montagem)).toBe('insert');
  });

  it('plano igual ao último não grava nada', () => {
    expect(nextPlanVersion(base, 'a', null)).toBe('none');
    expect(nextPlanVersion(montado, 'a', new Date(montagem))).toBe('none');
  });

  it('mudança do usuário, em qualquer dia, entra no plano em vigor', () => {
    expect(nextPlanVersion(base, 'b', null)).toBe('update');
    expect(nextPlanVersion(montado, 'b', montagem)).toBe('update');
  });

  it('a primeira montagem do assistente fica no lugar do plano base', () => {
    expect(nextPlanVersion(base, 'b', montagem)).toBe('replace');
  });

  it('plano refeito cria outro plano', () => {
    const refeito = new Date('2026-10-28T10:00:00.000Z');
    expect(nextPlanVersion(montado, 'b', refeito)).toBe('insert');
  });

  it('montagem que falhou não cria plano', () => {
    expect(nextPlanVersion(montado, 'b', null)).toBe('update');
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

describe('appendEdits', () => {
  it('põe as alterações novas, com o horário, na frente das que já havia', () => {
    const before = [meal(1, [['Arroz', 100]])];
    const after = [
      meal(1, [
        ['Arroz', 120],
        ['Banana', 60],
      ]),
    ];
    const log = appendEdits(
      [meal(1, [['Feijão', 80]])],
      before,
      '2026-10-25',
      null,
    );
    expect(
      appendEdits(before, after, '2026-10-26', '2026-10-26T14:32:00.000Z', log),
    ).toEqual([
      {
        meal: 'Refeição 1',
        kind: 'added',
        from: null,
        to: { name: 'Banana', grams: 60 },
        date: '2026-10-26',
        at: '2026-10-26T14:32:00.000Z',
      },
      {
        meal: 'Refeição 1',
        kind: 'grams',
        from: { name: 'Arroz', grams: 100 },
        to: { name: 'Arroz', grams: 120 },
        date: '2026-10-26',
        at: '2026-10-26T14:32:00.000Z',
      },
      {
        meal: 'Refeição 1',
        kind: 'swap',
        from: { name: 'Feijão', grams: 80 },
        to: { name: 'Arroz', grams: 100 },
        date: '2026-10-25',
        at: null,
      },
    ]);
  });

  it('sem mudança não acrescenta nada', () => {
    const meals = [meal(1, [['Arroz', 100]])];
    expect(
      appendEdits(meals, meals, '2026-10-26', '2026-10-26T14:32:00.000Z'),
    ).toEqual([]);
  });
});
