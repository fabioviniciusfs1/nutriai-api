// Cliente mínimo da Google Health API (v4): totais diários de atividade.
// Referência: https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp

const BASE_URL = 'https://health.googleapis.com/v4/users/me/dataTypes';

/** Escopo de leitura de atividade (passos, calorias, distância, minutos ativos). */
export const HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
];

export type DailyActivity = {
  date: string;
  steps: number;
  distanceKm: number;
  totalKcal: number | null;
  activeKcal: number;
  activeMinutes: number;
};

type CivilDate = { year: number; month: number; day: number };

type RollupPoint = {
  civilStartTime?: { date?: CivilDate };
  steps?: { countSum?: string };
  distance?: { millimetersSum?: string };
  totalCalories?: { kcalSum?: number };
  activeEnergyBurned?: { kcalSum?: number };
  activeMinutes?: {
    activeMinutesRollupByActivityLevel?: { activeMinutesSum?: string }[];
  };
};

function civilDate(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return { date: { year, month, day: date } };
}

function dayOf(point: RollupPoint): string | null {
  const date = point.civilStartTime?.date;
  if (!date) return null;
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export class HealthApiError extends Error {}

/**
 * Maior intervalo por chamada: `active-minutes` e `total-calories` aceitam até 14 dias (os outros
 * tipos, 90). Usa 14 para todos. O Google mede a duração como `pageSize × windowSizeDays`, então o
 * `pageSize` de cada chamada é o número de dias do bloco.
 */
const MAX_RANGE_DAYS = 14;

function addDay(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Blocos `[início, fim)` de até `MAX_RANGE_DAYS` dias cobrindo `from`…`to` (inclusive). */
export function chunks(from: string, to: string) {
  const blocks: {
    range: {
      start: ReturnType<typeof civilDate>;
      end: ReturnType<typeof civilDate>;
    };
    days: number;
  }[] = [];
  const endExclusive = addDay(to, 1);
  for (let start = from; start < endExclusive;) {
    let days = 0;
    let end = start;
    while (days < MAX_RANGE_DAYS && end < endExclusive) {
      end = addDay(end, 1);
      days++;
    }
    blocks.push({
      range: { start: civilDate(start), end: civilDate(end) },
      days,
    });
    start = end;
  }
  return blocks;
}

/** Mensagem e motivo do erro que o Google devolve no corpo (`{ error: { message, details } }`). */
async function errorMessage(response: Response) {
  const text = await response.text().catch(() => '');
  try {
    const { error } = JSON.parse(text) as {
      error?: { message?: string; details?: { reason?: string }[] };
    };
    const reason = error?.details?.find((detail) => detail.reason)?.reason;
    return (
      [error?.message, reason && `(${reason})`].filter(Boolean).join(' ') ||
      text
    );
  } catch {
    return text;
  }
}

/**
 * Totais por dia entre `from` e `to` (inclusive, "AAAA-MM-DD", no fuso do usuário no Google).
 * Só devolve os dias com algum dado.
 */
export async function fetchDailyActivity(
  accessToken: string,
  from: string,
  to: string,
): Promise<DailyActivity[]> {
  async function rollUp(type: string): Promise<RollupPoint[]> {
    const points: RollupPoint[] = [];
    for (const { range, days } of chunks(from, to)) {
      let pageToken: string | undefined;
      do {
        const response = await fetch(
          `${BASE_URL}/${type}/dataPoints:dailyRollUp`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              range,
              windowSizeDays: 1,
              pageSize: days,
              pageToken,
            }),
          },
        );
        if (!response.ok) {
          throw new HealthApiError(
            `Google Health API ${type}: HTTP ${response.status} ${await errorMessage(response)}`,
          );
        }
        const body = (await response.json()) as {
          rollupDataPoints?: RollupPoint[];
          nextPageToken?: string;
        };
        points.push(...(body.rollupDataPoints ?? []));
        pageToken = body.nextPageToken;
      } while (pageToken);
    }
    return points;
  }

  const [steps, distance, totalCalories, activeEnergy, activeMinutes] =
    await Promise.all([
      rollUp('steps'),
      rollUp('distance'),
      rollUp('total-calories'),
      rollUp('active-energy-burned'),
      rollUp('active-minutes'),
    ]);

  const days = new Map<string, DailyActivity>();
  const day = (point: RollupPoint) => {
    const date = dayOf(point);
    if (!date) return null;
    let entry = days.get(date);
    if (!entry) {
      entry = {
        date,
        steps: 0,
        distanceKm: 0,
        totalKcal: null,
        activeKcal: 0,
        activeMinutes: 0,
      };
      days.set(date, entry);
    }
    return entry;
  };
  for (const point of steps) {
    const entry = day(point);
    if (entry) entry.steps = Number(point.steps?.countSum ?? 0);
  }
  for (const point of distance) {
    const entry = day(point);
    if (entry)
      entry.distanceKm =
        Number(point.distance?.millimetersSum ?? 0) / 1_000_000;
  }
  for (const point of totalCalories) {
    const entry = day(point);
    if (entry && point.totalCalories?.kcalSum !== undefined)
      entry.totalKcal = point.totalCalories.kcalSum;
  }
  for (const point of activeEnergy) {
    const entry = day(point);
    if (entry) entry.activeKcal = point.activeEnergyBurned?.kcalSum ?? 0;
  }
  for (const point of activeMinutes) {
    const entry = day(point);
    if (entry) {
      entry.activeMinutes = (
        point.activeMinutes?.activeMinutesRollupByActivityLevel ?? []
      ).reduce((sum, level) => sum + Number(level.activeMinutesSum ?? 0), 0);
    }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
