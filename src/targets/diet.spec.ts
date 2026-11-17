import type { Profile } from '../contract.js';
import {
  adjustMacro,
  defaultDietSettings,
  dietAdjustment,
  dietSettingsError,
} from './diet.js';
import { calculateTargets } from './targets.js';

// 80 kg, meta de 2260 kcal: 28,25 kcal/kg.
const profile: Profile = {
  sex: 'masculino',
  age: 30,
  weightKg: 80,
  heightCm: 180,
  activityLevel: 'moderado',
  goal: 'perder',
  targetWeightKg: 75,
};
const defaults = defaultDietSettings(profile);
const kcal = calculateTargets(profile).calories;
const dayKcal = ({ grams }: ReturnType<typeof dietAdjustment>) =>
  grams.proteinas * 4 + grams.gorduras * 9 + grams.carboidratos * 4;

describe('ajuste da dieta', () => {
  it('sem ajuste, 2 g/kg de proteína, 1 g/kg de gordura e o resto em carboidrato', () => {
    expect(kcal).toBe(2260);
    const result = dietAdjustment(profile, defaults);
    expect(result.grams).toEqual({
      proteinas: 160,
      gorduras: 80,
      carboidratos: 225,
    });
    expect(result.perKg).toEqual({
      proteinas: 2,
      gorduras: 1,
      carboidratos: 2.81,
    });
    expect(result.split).toEqual({
      proteinas: 28,
      gorduras: 32,
      carboidratos: 40,
    });
  });

  it('baixar a proteína sobe o carboidrato; subir, desce; a meta calórica fica', () => {
    const lower = adjustMacro(profile, defaults, 'proteinas', 1.8);
    expect(lower).toMatchObject({ proteinPerKg: 1.8, fatPerKg: 1 });
    const before = dietAdjustment(profile, defaults);
    const after = dietAdjustment(profile, lower);
    expect(after.grams.carboidratos).toBeGreaterThan(before.grams.carboidratos);
    expect(Math.abs(dayKcal(after) - kcal)).toBeLessThanOrEqual(10);

    const higher = adjustMacro(profile, defaults, 'proteinas', 2.5);
    expect(dietAdjustment(profile, higher).grams.carboidratos).toBeLessThan(
      before.grams.carboidratos,
    );
  });

  it('baixar a gordura sobe o carboidrato', () => {
    const lower = adjustMacro(profile, defaults, 'gorduras', 0.7);
    expect(lower).toMatchObject({ proteinPerKg: 2, fatPerKg: 0.7 });
    expect(dietAdjustment(profile, lower).grams.carboidratos).toBe(279);
  });

  it('baixar o carboidrato sobe a gordura; subir, desce', () => {
    const lower = adjustMacro(profile, defaults, 'carboidratos', 2);
    expect(lower.proteinPerKg).toBe(2);
    expect(lower.fatPerKg).toBeCloseTo(1.4, 1);
    const result = dietAdjustment(profile, lower);
    expect(result.perKg.carboidratos).toBeCloseTo(2, 1);
    expect(Math.abs(dayKcal(result) - kcal)).toBeLessThanOrEqual(10);

    const higher = adjustMacro(profile, defaults, 'carboidratos', 3.5);
    expect(higher.fatPerKg).toBeLessThan(1);
  });

  it('não deixa baixar a proteína de 1,6 g/kg nem a gordura de 0,6 g/kg', () => {
    expect(adjustMacro(profile, defaults, 'proteinas', 1.2).proteinPerKg).toBe(
      1.6,
    );
    expect(adjustMacro(profile, defaults, 'gorduras', 0.2).fatPerKg).toBe(0.6);
    // Subir o carboidrato além do que a gordura mínima permite.
    const carbs = adjustMacro(profile, defaults, 'carboidratos', 9);
    expect(carbs.fatPerKg).toBe(0.6);
    expect(dietSettingsError(profile, carbs)).toBeNull();
  });

  it('não deixa o carboidrato negativo', () => {
    const protein = adjustMacro(profile, defaults, 'proteinas', 9);
    const result = dietAdjustment(profile, protein);
    expect(protein.proteinPerKg).toBe(result.maxPerKg.proteinas);
    expect(result.perKg.carboidratos).toBeGreaterThanOrEqual(0);
    expect(dietSettingsError(profile, protein)).toBeNull();
    expect(adjustMacro(profile, defaults, 'carboidratos', -1).fatPerKg).toBe(
      dietAdjustment(profile, defaults).maxPerKg.gorduras,
    );
  });

  it('informa os limites de cada macro', () => {
    const { minPerKg, maxPerKg } = dietAdjustment(profile, defaults);
    expect(minPerKg).toEqual({
      proteinas: 1.6,
      gorduras: 0.6,
      carboidratos: 0,
    });
    expect(maxPerKg).toEqual({
      proteinas: 4.81,
      gorduras: 2.25,
      carboidratos: 3.71,
    });
  });

  it('valida o ajuste salvo', () => {
    const error = (changes: Partial<typeof defaults>) =>
      dietSettingsError(profile, { ...defaults, ...changes });
    expect(error({})).toBeNull();
    expect(error({ proteinPerKg: 1.5 })).toBe(
      'A proteína deve ser de pelo menos 1,6 g/kg.',
    );
    expect(error({ fatPerKg: 0.4 })).toBe(
      'A gordura deve ser de pelo menos 0,6 g/kg.',
    );
    expect(error({ proteinPerKg: 5, fatPerKg: 1 })).toBe(
      'Proteína e gordura passam da meta de calorias.',
    );
    expect(error({ eggUnitGrams: 20 })).toBe(
      'O peso do ovo deve estar entre 30 e 90 g.',
    );
  });

  it('sem ajuste, proteína e gordura pela atividade física', () => {
    expect(
      defaultDietSettings({ ...profile, activityLevel: 'sedentario' }),
    ).toEqual({
      proteinPerKg: 1.2,
      fatPerKg: 0.7,
      eggUnitGrams: 55,
    });
    expect(defaultDietSettings({ ...profile, activityLevel: 'leve' })).toEqual({
      proteinPerKg: 1.6,
      fatPerKg: 0.7,
      eggUnitGrams: 55,
    });
    for (const activityLevel of ['moderado', 'intenso', 'extremo'] as const)
      expect(defaultDietSettings({ ...profile, activityLevel })).toMatchObject({
        proteinPerKg: 2,
        fatPerKg: 1,
      });
  });

  it('o sedentário pode baixar a proteína até 1,2 g/kg', () => {
    const sedentary: Profile = { ...profile, activityLevel: 'sedentario' };
    const settings = defaultDietSettings(sedentary);
    expect(dietAdjustment(sedentary, settings).minPerKg.proteinas).toBe(1.2);
    expect(adjustMacro(sedentary, settings, 'proteinas', 1).proteinPerKg).toBe(
      1.2,
    );
    expect(
      dietSettingsError(sedentary, { ...settings, proteinPerKg: 1.1 }),
    ).toBe('A proteína deve ser de pelo menos 1,2 g/kg.');
    const light: Profile = { ...profile, activityLevel: 'leve' };
    expect(
      dietAdjustment(light, defaultDietSettings(light)).minPerKg.proteinas,
    ).toBe(1.6);
  });
});
