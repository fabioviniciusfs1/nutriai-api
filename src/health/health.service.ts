import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, type Repository } from 'typeorm';
import {
  createOAuthClient,
  googleConfigured,
} from '../auth/google/google-oauth.js';
import { decryptToken } from '../auth/google/token-crypto.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { addDays, localDate, type UserClock } from '../common/timezone.js';
import {
  ActivityDayEntity,
  GoogleAccountEntity,
} from '../database/entities/index.js';
import { fetchDailyActivity } from './health-api.js';

/** Nome da fonte de atividade nas respostas. */
export const GOOGLE_SOURCE = 'Google Health';

/** Intervalo mínimo entre sincronizações automáticas. */
const SYNC_INTERVAL_MS = 60 * 60 * 1000;
/** No máximo quantos dias para trás uma sincronização importa (o histórico mostra até 90). */
const MAX_SYNC_DAYS = 90;
/** Nas seguintes, reimporta pelo menos alguns dias (o dia de hoje e os recentes ainda mudam). */
const RESYNC_DAYS = 7;

/**
 * Primeiro dia a importar. Nunca antes do dia 0 (`startDate`, o dia em que o Google foi conectado): na
 * primeira vez, só o dia 0; depois, desde o dia da última sincronização (para não deixar buraco se ela
 * ficou dias sem rodar), com pelo menos os últimos 7 dias e no máximo 90.
 */
export function syncStartDate(
  today: string,
  lastSync: Date | null,
  timeZone: string,
  startDate: string,
): string {
  const max = (a: string, b: string) => (a > b ? a : b);
  const oldest = max(addDays(today, -(MAX_SYNC_DAYS - 1)), startDate);
  if (!lastSync) return oldest;
  const sinceLast = localDate(lastSync, timeZone);
  const recent = addDays(today, -(RESYNC_DAYS - 1));
  const from = sinceLast < recent ? sinceLast : recent;
  return max(from, oldest);
}

/** Importa a atividade do usuário da Google Health API para `activity_days`. */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  /** Sincronizações em andamento por usuário (evita duplicar chamadas ao Google). */
  private readonly running = new Map<string, Promise<boolean>>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectRepository(GoogleAccountEntity)
    private readonly accounts: Repository<GoogleAccountEntity>,
    @InjectRepository(ActivityDayEntity)
    private readonly activityDays: Repository<ActivityDayEntity>,
  ) {}

  /** Sincroniza se a última vez foi há mais de 1 h. Nunca lança: sem dados novos, segue com os que tem. */
  async syncIfStale(userId: string, clock: UserClock): Promise<void> {
    const account = await this.accounts.findOneBy({ userId });
    if (!account?.refreshTokenEnc || !googleConfigured(this.config)) return;
    if (
      account.lastSync &&
      Date.now() - account.lastSync.getTime() < SYNC_INTERVAL_MS
    )
      return;
    await this.sync(account, clock);
  }

  /** Sincroniza agora (logo depois de conectar a conta). Nunca lança. */
  async syncNow(userId: string, clock: UserClock): Promise<void> {
    const account = await this.accounts.findOneBy({ userId });
    if (account?.refreshTokenEnc && googleConfigured(this.config))
      await this.sync(account, clock);
  }

  /**
   * Sincroniza todas as contas Google com refresh token, uma por vez (a tarefa agendada da madrugada).
   * `timeZone` define o "hoje" de cada importação. Nunca lança.
   */
  async syncAll(timeZone: string): Promise<{ ok: number; failed: number }> {
    if (!googleConfigured(this.config)) return { ok: 0, failed: 0 };
    const accounts = await this.accounts.find({
      where: { refreshTokenEnc: Not(IsNull()) },
    });
    const clock = { timeZone, today: localDate(new Date(), timeZone) };
    let ok = 0;
    for (const account of accounts) if (await this.sync(account, clock)) ok++;
    return { ok, failed: accounts.length - ok };
  }

  /** Sincroniza uma conta; `true` se deu certo. Nunca lança. */
  private sync(
    account: GoogleAccountEntity,
    clock: UserClock,
  ): Promise<boolean> {
    let running = this.running.get(account.userId);
    if (!running) {
      running = this.doSync(account, clock)
        .then(() => true)
        .catch((error: unknown) => {
          this.logger.warn(
            `Falha ao sincronizar a atividade do usuário ${account.userId}: ${String(error)}`,
          );
          return false;
        })
        .finally(() => this.running.delete(account.userId));
      this.running.set(account.userId, running);
    }
    return running;
  }

  private async doSync(
    account: GoogleAccountEntity,
    { today, timeZone }: UserClock,
  ) {
    const client = createOAuthClient(this.config);
    client.setCredentials({
      refresh_token: decryptToken(
        account.refreshTokenEnc!,
        this.config.google.tokenEncryptionKey!,
      ),
    });
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('o Google não devolveu um access token');

    const from = syncStartDate(
      today,
      account.lastSync,
      timeZone,
      account.startDate,
    );
    const days = await fetchDailyActivity(token, from, today);
    if (days.length > 0) {
      await this.activityDays.upsert(
        days.map((day) => ({
          userId: account.userId,
          date: day.date,
          burned: Math.round(day.totalKcal ?? day.activeKcal),
          activeCalories: Math.round(day.activeKcal),
          steps: Math.round(day.steps),
          activeMinutes: Math.round(day.activeMinutes),
          distanceKm: Math.round(day.distanceKm * 10) / 10,
          source: GOOGLE_SOURCE,
        })),
        ['userId', 'date'],
      );
    }
    await this.accounts.update(
      { userId: account.userId },
      { lastSync: new Date() },
    );
  }
}
