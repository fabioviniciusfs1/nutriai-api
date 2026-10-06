// Estatísticas do histórico, a partir das fotos diárias do plano e da atividade importada.
import { addDays } from '../common/timezone.js';
import type {
  ActivityHistory,
  HistorySummary,
  NutrientHistory,
  PlanHistoryDay,
} from '../contract.js';
import type {
  ActivityDayEntity,
  DayLogEntity,
} from '../database/entities/index.js';
import { displayValue } from '../nutrition/nutrient-goals.js';

/** Um dia conta como "dentro da meta" quando o consumo fica a até esta distância da meta (kcal). */
export const GOAL_TOLERANCE = 150;

/** Fonte mostrada nos dias sem dados de atividade: o gasto é o estimado pelo perfil. */
export const ESTIMATED_SOURCE = 'Estimativa do perfil';

export type DayLog = Pick<
  DayLogEntity,
  'date' | 'consumedKcal' | 'nutrients' | 'meals' | 'flaggedFoods'
>;
type ActivityDay = Omit<ActivityDayEntity, 'userId'>;

function average(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Fotos de cada dia de `dates`. A foto só é gravada quando o usuário abre o app; num dia sem foto, o plano
 * era o mesmo do último dia gravado (o plano vale todo dia até ser mudado), então ele é repetido, sem as
 * marcações de alimentos (que são do dia em que foram feitas). Antes da primeira foto não há plano: o dia
 * fica de fora. `previous` é a última foto antes de `dates[0]`, se houver.
 */
export function fillDayLogs(
  dates: string[],
  logs: DayLog[],
  previous: DayLog | null,
): DayLog[] {
  const byDate = new Map(logs.map((log) => [log.date, log]));
  const filled: DayLog[] = [];
  let last = previous;
  for (const date of dates) {
    const log = byDate.get(date);
    if (log) last = log;
    else if (last) filled.push({ ...last, date, flaggedFoods: [] });
    if (log) filled.push(log);
  }
  return filled;
}

/** Os `days` dias terminando em `today`, do mais antigo para o mais recente. */
export function windowDates(today: string, days: number) {
  return Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
}

/**
 * Médias dos dias com registro de consumo. O gasto de um dia sem dados de atividade é o gasto
 * diário estimado pelo perfil (`estimatedBurn`).
 */
export function historySummary(
  logs: DayLog[],
  activity: Map<string, ActivityDay>,
  estimatedBurn: number | null,
  calorieGoal: number,
): HistorySummary {
  const avgConsumed = Math.round(average(logs.map((log) => log.consumedKcal)));
  const avgBurned = Math.round(
    average(
      logs.map((log) => activity.get(log.date)?.burned ?? estimatedBurn ?? 0),
    ),
  );
  return {
    avgConsumed,
    avgBurned,
    avgBalance: avgConsumed - avgBurned,
    daysOnGoal: logs.filter(
      (log) => Math.abs(log.consumedKcal - calorieGoal) <= GOAL_TOLERANCE,
    ).length,
    totalDays: logs.length,
    calorieGoal,
    goalTolerance: GOAL_TOLERANCE,
  };
}

/** Dias com consumo ou atividade; as médias consideram só os dias com dados de atividade. */
export function activityHistory(
  dates: string[],
  logs: Map<string, DayLog>,
  activity: Map<string, ActivityDay>,
  estimatedBurn: number | null,
): ActivityHistory {
  const days = dates
    .filter((date) => logs.has(date) || activity.has(date))
    .map((date) => {
      const day = activity.get(date);
      return {
        date,
        consumed: logs.get(date)?.consumedKcal ?? 0,
        burned: day?.burned ?? estimatedBurn ?? 0,
        activeCalories: day?.activeCalories ?? 0,
        steps: day?.steps ?? 0,
        activeMinutes: day?.activeMinutes ?? 0,
        distanceKm: day?.distanceKm ?? 0,
        source: day?.source ?? ESTIMATED_SOURCE,
      };
    });
  const tracked = dates.flatMap((date) => activity.get(date) ?? []);
  return {
    days,
    averages: {
      steps: Math.round(average(tracked.map((day) => day.steps))),
      activeCalories: Math.round(
        average(tracked.map((day) => day.activeCalories)),
      ),
      activeMinutes: Math.round(
        average(tracked.map((day) => day.activeMinutes)),
      ),
    },
    totalDistanceKm: Math.round(
      tracked.reduce((total, day) => total + day.distanceKm, 0),
    ),
  };
}

/** Consumo de um nutriente dia a dia; dia sem registro vale 0. */
export function nutrientHistory(
  dates: string[],
  logs: Map<string, DayLog>,
  nutrient: NutrientHistory['nutrient'],
): NutrientHistory {
  const { meta } = nutrient;
  const days = dates.map((date) => ({
    date,
    value: displayValue(logs.get(date)?.nutrients[nutrient.id] ?? 0, meta),
  }));
  const mean = average(days.map((day) => day.value));
  return {
    nutrient,
    days,
    average: displayValue(mean, meta),
    averagePercent: meta > 0 ? Math.round((mean / meta) * 100) : 0,
    daysOnGoal: days.filter((day) => day.value >= meta).length,
    daysOverLimit: days.filter((day) => day.value > meta).length,
  };
}

/** Planos dos dias anteriores, do mais recente para o mais antigo. */
export function planHistory(logs: DayLog[], today: string): PlanHistoryDay[] {
  return logs
    .filter((log) => log.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((log) => ({
      date: log.date,
      // Ainda não há como marcar uma refeição como feita: o plano do dia conta como seguido.
      followedCount: log.meals.length,
      plannedKcal: log.meals.reduce((sum, meal) => sum + meal.kcal, 0),
      meals: log.meals.map((meal) => ({ ...meal, followed: true })),
      flaggedFoods: log.flaggedFoods,
    }));
}
