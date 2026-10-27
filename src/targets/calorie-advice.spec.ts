import {
  calorieAdvice,
  type CalorieAdviceInput,
  goalForTarget,
  stepCalories,
  weeklyChange,
} from './calorie-advice.js';

const TZ = 'America/Sao_Paulo';
const TODAY = '2026-10-27';
/** Pesagem às 8h (São Paulo) do dia. */
const weighing = (day: string, kg: number) => ({
  at: new Date(`${day}T11:00:00Z`),
  kg,
});

describe('stepCalories', () => {
  it('10% da meta em vigor, em dezenas', () => {
    expect(stepCalories(2000, 'decrease', 1500)).toBe(1800);
    expect(stepCalories(1800, 'decrease', 1500)).toBe(1620);
    expect(stepCalories(1620, 'increase', 1500)).toBe(1780);
  });

  it('nunca abaixo do piso', () => {
    expect(stepCalories(1600, 'decrease', 1500)).toBe(1500);
    expect(stepCalories(1500, 'decrease', 1500)).toBe(1500);
  });
});

describe('weeklyChange', () => {
  it('da pesagem de 7 dias antes para a mais recente', () => {
    const weights = [
      weighing('2026-10-13', 91),
      weighing('2026-10-20', 90),
      weighing('2026-10-27', 89.9),
    ];
    expect(weeklyChange(weights, null, TODAY, TZ)).toBe(-0.1);
  });

  it('sem pesagem uma semana antes, ou a última velha demais, não há variação', () => {
    expect(
      weeklyChange(
        [weighing('2026-10-24', 90), weighing('2026-10-27', 89.9)],
        null,
        TODAY,
        TZ,
      ),
    ).toBeNull();
    expect(
      weeklyChange(
        [weighing('2026-10-06', 90), weighing('2026-10-13', 90)],
        null,
        TODAY,
        TZ,
      ),
    ).toBeNull();
  });

  it('pesagens antes do último ajuste não contam', () => {
    const weights = [weighing('2026-10-20', 90), weighing('2026-10-27', 90)];
    expect(weeklyChange(weights, '2026-10-21', TODAY, TZ)).toBeNull();
    expect(weeklyChange(weights, '2026-10-20', TODAY, TZ)).toBe(0);
  });
});

describe('calorieAdvice', () => {
  const losing: CalorieAdviceInput = {
    goal: 'perder',
    targetWeightKg: 60,
    weights: [weighing('2026-10-20', 90), weighing('2026-10-27', 89.9)],
    weeklyChangeKg: -0.1,
    turned: false,
    calories: 2000,
    minimum: 1500,
  };

  it('perdendo, o peso parou de cair: diminuir 10%', () => {
    expect(calorieAdvice(losing)).toMatchObject({
      kind: 'decrease',
      text: expect.stringContaining('para 1.800 kcal'),
    });
  });

  it('perdendo 0,2 kg ou mais na semana, nada a sugerir', () => {
    expect(calorieAdvice({ ...losing, weeklyChangeKg: -0.2 })).toBeNull();
    expect(calorieAdvice({ ...losing, weeklyChangeKg: null })).toBeNull();
  });

  it('com a meta no piso, não sugere diminuir', () => {
    expect(
      calorieAdvice({ ...losing, calories: 1500, minimum: 1500 }),
    ).toMatchObject({ kind: 'floor' });
  });

  it('chegou ao peso meta: escolher um novo, perdendo ou ganhando', () => {
    expect(
      calorieAdvice({
        ...losing,
        weights: [weighing('2026-10-27', 59.8)],
        weeklyChangeKg: null,
      }),
    ).toMatchObject({
      kind: 'reached',
      text: expect.stringContaining('Escolha um novo peso meta'),
    });
    expect(
      calorieAdvice({
        ...losing,
        goal: 'ganhar',
        targetWeightKg: 65,
        weights: [weighing('2026-10-27', 65.2)],
      }),
    ).toMatchObject({ kind: 'reached' });
  });

  it('o objetivo acabou de virar: ajustar na direção nova', () => {
    expect(
      calorieAdvice({
        ...losing,
        goal: 'ganhar',
        targetWeightKg: 65,
        weights: [weighing('2026-10-27', 59.8)],
        weeklyChangeKg: null,
        turned: true,
      }),
    ).toMatchObject({
      kind: 'increase',
      text: expect.stringContaining('para 2.200 kcal'),
    });
    expect(
      calorieAdvice({ ...losing, weeklyChangeKg: null, turned: true }),
    ).toMatchObject({ kind: 'decrease', title: 'Você escolheu perder peso' });
  });

  it('ganhando, o peso parou de subir: aumentar 10%', () => {
    const gaining = {
      ...losing,
      goal: 'ganhar' as const,
      targetWeightKg: null,
    };
    expect(calorieAdvice({ ...gaining, weeklyChangeKg: 0.1 })).toMatchObject({
      kind: 'increase',
    });
    expect(calorieAdvice({ ...gaining, weeklyChangeKg: 0.3 })).toBeNull();
  });

  it('sem pesagem ou mantendo o peso, nada a sugerir', () => {
    expect(
      calorieAdvice({ ...losing, weights: [], weeklyChangeKg: null }),
    ).toBeNull();
    expect(calorieAdvice({ ...losing, goal: 'manter' })).toBeNull();
  });
});

describe('goalForTarget', () => {
  it('acima do peso atual ganha, abaixo perde', () => {
    expect(goalForTarget(65, 59.8)).toBe('ganhar');
    expect(goalForTarget(55, 59.8)).toBe('perder');
    expect(goalForTarget(59.8, 59.8)).toBeNull();
  });
});
