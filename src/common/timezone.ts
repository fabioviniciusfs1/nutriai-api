import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Fuso IANA válido do cabeçalho `X-Timezone`, ou o padrão. */
export function resolveTimezone(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Dia "AAAA-MM-DD" de `date` no fuso `timeZone`. */
export function localDate(date: Date, timeZone: string): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Dia da semana (0 = domingo … 6 = sábado) de um dia "AAAA-MM-DD". */
export function weekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** `day` deslocado `delta` dias ("AAAA-MM-DD"). */
export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** O "hoje" do usuário e o fuso dele, vindos de `X-Timezone`. */
export type UserClock = { timeZone: string; today: string };

export function userClock(
  header: string | string[] | undefined,
  now = new Date(),
): UserClock {
  const timeZone = resolveTimezone(header);
  return { timeZone, today: localDate(now, timeZone) };
}

/** Injeta o `UserClock` da requisição. */
export const Clock = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserClock => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return userClock(request.headers['x-timezone']);
  },
);
