import type { Profile } from '../contract.js';
import {
  calculateTargets,
  macroSplit,
  macroTargets,
  perKg,
  projectWeight,
  targetWeightError,
} from './targets.js';

const ana: Profile = {
  sex: 'feminino',
  age: 32,
  weightKg: 68.5,
  heightCm: 165,
  activityLevel: 'moderado',
  goal: 'perder',
  targetWeightKg: null,
};

describe('calculateTargets', () => {
  it('reproduz o exemplo do contrato', () => {
    expect(calculateTargets(ana)).toEqual({
      calories: 1660,
      bmr: 1395,
      tdee: 2163,
      waterLiters: 2.4,
      waterMlPerKg: 35,
      clampedToMinimum: false,
    });
  });

  it('aplica o piso por sexo', () => {
    const small: Profile = {
      ...ana,
      weightKg: 45,
      heightCm: 150,
      age: 60,
      activityLevel: 'sedentario',
    };
    expect(calculateTargets(small)).toMatchObject({
      calories: 1200,
      clampedToMinimum: true,
    });
    expect(calculateTargets({ ...small, sex: 'masculino' })).toMatchObject({
      calories: 1500,
      clampedToMinimum: true,
    });
  });

  it('ajusta pelo objetivo', () => {
    expect(calculateTargets({ ...ana, goal: 'manter' }).calories).toBe(2160);
    expect(calculateTargets({ ...ana, goal: 'ganhar' }).calories).toBe(2460);
  });
});

describe('macroTargets', () => {
  it('2 g/kg de proteína, 1 g/kg de gordura e o resto em carboidrato', () => {
    // 1660 kcal − 137 g × 4 − 68,5 g × 9 = 495,5 kcal → 124 g de carboidrato.
    expect(macroTargets(ana)).toEqual({
      proteinas: 137,
      gorduras: 69,
      carboidratos: 124,
    });
  });

  it('carboidrato não fica negativo', () => {
    const heavy: Profile = {
      ...ana,
      weightKg: 150,
      heightCm: 150,
      age: 80,
      activityLevel: 'sedentario',
    };
    expect(macroTargets(heavy)).toMatchObject({
      proteinas: 300,
      gorduras: 150,
      carboidratos: 0,
    });
  });
});

describe('perKg', () => {
  it('uma casa decimal', () => {
    expect(perKg(137, 68.5)).toBe(2);
    expect(perKg(81, 68.5)).toBe(1.2);
  });
});

describe('projectWeight', () => {
  const START = '2026-10-20';

  it('perde ~7.700 kcal por kg com o déficit da meta', () => {
    // 1660 − 2163 = −503 kcal/dia
    expect(projectWeight({ ...ana, targetWeightKg: 60 }, START)).toEqual({
      months: 4.3,
      duration: { months: 4, days: 8 },
      weeklyChangeKg: -0.5,
      points: [
        { month: 0, date: '2026-10-20', weightKg: 68.5 },
        { month: 1, date: '2026-11-20', weightKg: 66.5 },
        { month: 2, date: '2026-12-20', weightKg: 64.5 },
        { month: 3, date: '2027-01-20', weightKg: 62.5 },
        { month: 4, date: '2027-02-20', weightKg: 60.5 },
        { month: 4.3, date: '2027-02-28', weightKg: 60 },
      ],
    });
  });

  it('ganha com o superávit da meta', () => {
    // 2460 − 2163 = +297 kcal/dia
    expect(
      projectWeight({ ...ana, goal: 'ganhar', targetWeightKg: 72 }, START),
    ).toEqual({
      months: 3,
      duration: { months: 2, days: 30 },
      weeklyChangeKg: 0.3,
      points: [
        { month: 0, date: '2026-10-20', weightKg: 68.5 },
        { month: 1, date: '2026-11-20', weightKg: 69.7 },
        { month: 2, date: '2026-12-20', weightKg: 70.8 },
        { month: 3, date: '2027-01-19', weightKg: 72 },
      ],
    });
  });

  it('demora mais quando a meta sobe até o piso', () => {
    // Gasto 1411, meta no piso de 1200: déficit de 211 kcal/dia.
    const small: Profile = {
      ...ana,
      weightKg: 55,
      heightCm: 150,
      age: 60,
      activityLevel: 'leve',
    };
    expect(calculateTargets(small)).toMatchObject({
      tdee: 1411,
      calories: 1200,
      clampedToMinimum: true,
    });
    expect(
      projectWeight({ ...small, targetWeightKg: 50 }, START),
    ).toMatchObject({
      months: 6,
      weeklyChangeKg: -0.2,
    });
  });

  it('exige o peso meta', () => {
    expect(projectWeight(ana, START)).toBe('Informe o peso meta.');
    expect(projectWeight({ ...ana, goal: 'manter' }, START)).toBe(
      'Com o objetivo de manter o peso, não há peso meta.',
    );
  });

  it('recusa peso meta que não combina com o objetivo', () => {
    expect(
      projectWeight({ ...ana, goal: 'manter', targetWeightKg: 60 }, START),
    ).toBe('Com o objetivo de manter o peso, não há peso meta.');
    expect(projectWeight({ ...ana, targetWeightKg: 70 }, START)).toBe(
      'Para perder peso, o peso meta deve ser menor que o atual.',
    );
    expect(
      projectWeight({ ...ana, goal: 'ganhar', targetWeightKg: 68.5 }, START),
    ).toBe('Para ganhar peso, o peso meta deve ser maior que o atual.');
    const floor: Profile = {
      ...ana,
      weightKg: 45,
      heightCm: 150,
      age: 60,
      activityLevel: 'sedentario',
    };
    expect(projectWeight({ ...floor, targetWeightKg: 42 }, START)).toMatch(
      /meta mínima de calorias/,
    );
  });
});

describe('targetWeightError', () => {
  it('exige meta para perder ou ganhar, e só nesses objetivos', () => {
    expect(targetWeightError(ana)).toBe('Informe o peso meta.');
    expect(targetWeightError({ ...ana, goal: 'ganhar' })).toBe(
      'Informe o peso meta.',
    );
    expect(targetWeightError({ ...ana, goal: 'manter' })).toBeNull();
    expect(targetWeightError({ ...ana, targetWeightKg: 60 })).toBeNull();
    expect(
      targetWeightError({ ...ana, goal: 'ganhar', targetWeightKg: 75 }),
    ).toBeNull();
  });

  it('recusa meta com manter ou na direção contrária', () => {
    expect(
      targetWeightError({ ...ana, goal: 'manter', targetWeightKg: 60 }),
    ).toBe('Com o objetivo de manter o peso, não há peso meta.');
    expect(targetWeightError({ ...ana, targetWeightKg: 68.5 })).toBe(
      'Para perder peso, o peso meta deve ser menor que o atual.',
    );
    expect(
      targetWeightError({ ...ana, goal: 'ganhar', targetWeightKg: 60 }),
    ).toBe('Para ganhar peso, o peso meta deve ser maior que o atual.');
  });
});

describe('macroSplit', () => {
  it('reparte as calorias dos macros em % que somam 100', () => {
    // 100 g de proteína (400 kcal), 50 g de gordura (450 kcal), 150 g de carboidrato (600 kcal).
    expect(
      macroSplit({ proteinas: 100, gorduras: 50, carboidratos: 150 }),
    ).toEqual({ proteinas: 28, gorduras: 31, carboidratos: 41 });
  });

  it('dá os pontos perdidos no arredondamento às maiores sobras', () => {
    // Um terço das calorias para cada: 33,3% → 34 + 33 + 33.
    const split = macroSplit({ proteinas: 9, gorduras: 4, carboidratos: 9 });
    expect(split).toEqual({ proteinas: 34, carboidratos: 33, gorduras: 33 });
  });

  it('sem consumo não há distribuição', () => {
    expect(macroSplit({ proteinas: 0, gorduras: 0, carboidratos: 0 })).toBe(
      null,
    );
  });
});
