import type { Profile } from '../contract.js';
import { calculateTargets, macroTargets, perKg } from './targets.js';

const ana: Profile = {
  sex: 'feminino',
  age: 32,
  weightKg: 68.5,
  heightCm: 165,
  activityLevel: 'moderado',
  goal: 'perder',
  mealsPerDay: 4,
  weighInDay: 1,
};

describe('calculateTargets', () => {
  it('reproduz o exemplo do contrato', () => {
    expect(calculateTargets(ana)).toEqual({
      calories: 1660,
      bmr: 1395,
      tdee: 2163,
      waterLiters: 2.4,
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
