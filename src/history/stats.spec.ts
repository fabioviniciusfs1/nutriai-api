import {
  activityHistory,
  datesSince,
  fillDayLogs,
  historySummary,
  nutrientHistory,
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
  it('desde a criação da conta até hoje', () => {
    expect(datesSince('2026-09-26', '2026-09-28')).toEqual([
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
    ]);
    expect(datesSince('2026-09-28', '2026-09-28')).toEqual(['2026-09-28']);
  });

  it('janela termina hoje', () => {
    expect(windowDates('2026-09-28', 3)).toEqual([
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
    ]);
  });

  it('resumo: gasto e saldo só dos dias com atividade', () => {
    const logs = [log('2026-09-27', 1600), log('2026-09-28', 2000)];
    const summary = historySummary(
      logs,
      new Map([['2026-09-28', activity('2026-09-28', 2400)]]),
      1660,
    );
    expect(summary).toEqual({
      avgConsumed: 1800,
      avgBurned: 2400,
      avgBalance: -400,
      daysOnGoal: 1,
      totalDays: 2,
      calorieGoal: 1660,
      goalTolerance: 150,
    });
  });

  it('resumo sem dados de atividade: sem gasto nem saldo', () => {
    const summary = historySummary([log('2026-09-28', 2000)], new Map(), 1660);
    expect(summary).toMatchObject({
      avgConsumed: 2000,
      avgBurned: null,
      avgBalance: null,
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
    );
    expect(
      result.days.map((day) => [day.date, day.burned, day.source]),
    ).toEqual([
      ['2026-09-26', 2300, 'Google Health'],
      ['2026-09-27', null, null],
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
