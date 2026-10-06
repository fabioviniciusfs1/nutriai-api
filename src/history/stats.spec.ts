import {
  activityHistory,
  fillDayLogs,
  historySummary,
  nutrientHistory,
  planHistory,
  windowDates,
} from './stats.js';

const log = (
  date: string,
  consumedKcal: number,
  nutrients: Record<string, number> = {},
) => ({
  date,
  consumedKcal,
  nutrients,
  meals: [{ time: '07:30', title: 'Café', kcal: consumedKcal }],
  flaggedFoods: [],
});

const activity = (date: string, burned: number) => ({
  date,
  burned,
  activeCalories: 400,
  steps: 8000,
  activeMinutes: 60,
  distanceKm: 6.2,
  source: 'Google Health',
});

describe('history stats', () => {
  it('janela termina hoje', () => {
    expect(windowDates('2026-09-28', 3)).toEqual([
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
    ]);
  });

  it('resumo usa o gasto estimado nos dias sem atividade', () => {
    const logs = [log('2026-09-27', 1600), log('2026-09-28', 2000)];
    const summary = historySummary(
      logs,
      new Map([['2026-09-28', activity('2026-09-28', 2400)]]),
      2100,
      1660,
    );
    expect(summary).toEqual({
      avgConsumed: 1800,
      avgBurned: 2250,
      avgBalance: -450,
      daysOnGoal: 1,
      totalDays: 2,
      calorieGoal: 1660,
      goalTolerance: 150,
    });
  });

  it('atividade: só dias com dados, médias dos dias com atividade', () => {
    const dates = windowDates('2026-09-28', 7);
    const result = activityHistory(
      dates,
      new Map([['2026-09-27', log('2026-09-27', 1500)]]),
      new Map([
        ['2026-09-26', activity('2026-09-26', 2300)],
        ['2026-09-28', activity('2026-09-28', 2400)],
      ]),
      2000,
    );
    expect(
      result.days.map((day) => [day.date, day.burned, day.source]),
    ).toEqual([
      ['2026-09-26', 2300, 'Google Health'],
      ['2026-09-27', 2000, 'Estimativa do perfil'],
      ['2026-09-28', 2400, 'Google Health'],
    ]);
    expect(result.averages).toEqual({
      steps: 8000,
      activeCalories: 400,
      activeMinutes: 60,
    });
    expect(result.totalDistanceKm).toBe(12);
  });

  it('nutriente: dia sem registro vale 0', () => {
    const dates = windowDates('2026-09-28', 4);
    const logs = new Map([
      ['2026-09-27', log('2026-09-27', 0, { sodio: 2100 })],
      ['2026-09-28', log('2026-09-28', 0, { sodio: 1900 })],
    ]);
    const result = nutrientHistory(dates, logs, {
      id: 'sodio',
      name: 'Sódio',
      unit: 'mg',
      meta: 2000,
      limit: true,
    });
    expect(result.days.map((day) => day.value)).toEqual([0, 0, 2100, 1900]);
    expect(result).toMatchObject({
      average: 1000,
      averagePercent: 50,
      daysOnGoal: 1,
      daysOverLimit: 1,
    });
  });

  it('planos anteriores do mais recente para o mais antigo, sem hoje', () => {
    const result = planHistory(
      [
        log('2026-09-26', 1400),
        log('2026-09-28', 1500),
        log('2026-09-27', 1450),
      ],
      '2026-09-28',
    );
    expect(result.map((day) => day.date)).toEqual(['2026-09-27', '2026-09-26']);
    expect(result[0]).toMatchObject({ followedCount: 1, plannedKcal: 1450 });
  });

  it('dia sem foto repete o plano do último dia gravado; antes da primeira foto, nada', () => {
    const dates = windowDates('2026-10-05', 7);
    const first = {
      ...log('2026-10-01', 2290),
      flaggedFoods: [{ name: 'Guacamole', feedback: 'nao-quero' as const }],
    };
    const filled = fillDayLogs(
      dates,
      [first, log('2026-10-03', 2100), log('2026-10-05', 2100)],
      null,
    );
    expect(filled.map((day) => [day.date, day.consumedKcal])).toEqual([
      ['2026-10-01', 2290],
      ['2026-10-02', 2290],
      ['2026-10-03', 2100],
      ['2026-10-04', 2100],
      ['2026-10-05', 2100],
    ]);
    // As marcações são do dia em que foram feitas.
    expect(filled[0].flaggedFoods).toHaveLength(1);
    expect(filled[1].flaggedFoods).toEqual([]);
  });

  it('usa a última foto de antes da janela', () => {
    const filled = fillDayLogs(
      ['2026-10-04', '2026-10-05'],
      [],
      log('2026-09-20', 1800),
    );
    expect(filled.map((day) => [day.date, day.consumedKcal])).toEqual([
      ['2026-10-04', 1800],
      ['2026-10-05', 1800],
    ]);
  });
});
