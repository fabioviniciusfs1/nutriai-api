import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, type Repository } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service.js';
import type { UserClock } from '../common/timezone.js';
import type {
  ActivityHistory,
  ActivitySource,
  HistorySummary,
  NutrientHistory,
  PlanHistoryDay,
} from '../contract.js';
import {
  ActivityDayEntity,
  DayLogEntity,
  GoogleAccountEntity,
} from '../database/entities/index.js';
import { GOOGLE_SOURCE, HealthService } from '../health/health.service.js';
import { nutrientGoal } from '../nutrition/nutrient-goals.js';
import { PlanService } from '../plan/plan.service.js';
import { calculateTargets, DEFAULT_CALORIE_GOAL } from '../targets/targets.js';
import { UsersService } from '../users/users.service.js';
import {
  activityHistory,
  fillDayLogs,
  historySummary,
  nutrientHistory,
  planHistory,
  windowDates,
} from './stats.js';

/** Períodos que o front pede. */
export const PERIODS = [7, 30, 90];

/** Quantos dias anteriores `/history/plans` devolve. */
const PLAN_HISTORY_DAYS = 90;

@Injectable()
export class HistoryService {
  constructor(
    private readonly users: UsersService,
    private readonly plan: PlanService,
    private readonly health: HealthService,
    private readonly catalog: CatalogService,
    @InjectRepository(DayLogEntity)
    private readonly dayLogs: Repository<DayLogEntity>,
    @InjectRepository(ActivityDayEntity)
    private readonly activityDays: Repository<ActivityDayEntity>,
    @InjectRepository(GoogleAccountEntity)
    private readonly googleAccounts: Repository<GoogleAccountEntity>,
  ) {}

  /** Dados da janela de `days` dias até hoje (com a foto de hoje atualizada). */
  private async window(userId: string, clock: UserClock, days: number) {
    if (!PERIODS.includes(days))
      throw new BadRequestException('Período inválido: use 7, 30 ou 90 dias.');
    // Lê o plano de hoje para a foto do dia existir e estar em dia.
    await this.plan.read(userId, clock, () => null);
    const dates = windowDates(clock.today, days);
    const range = Between(dates[0], dates[dates.length - 1]);
    const [user, logs, activity] = await Promise.all([
      this.users.get(userId),
      this.filledLogs(userId, dates),
      this.activityDays.find({ where: { userId, date: range } }),
    ]);
    const targets = user.profile ? calculateTargets(user.profile) : null;
    return {
      user,
      dates,
      logs,
      logsByDate: new Map(logs.map((log) => [log.date, log])),
      activityByDate: new Map(activity.map((day) => [day.date, day])),
      estimatedBurn: targets?.tdee ?? null,
      calorieGoal: targets?.calories ?? DEFAULT_CALORIE_GOAL,
    };
  }

  async summary(
    userId: string,
    clock: UserClock,
    days: number,
  ): Promise<HistorySummary> {
    await this.health.syncIfStale(userId, clock);
    const data = await this.window(userId, clock, days);
    return historySummary(
      data.logs,
      data.activityByDate,
      data.estimatedBurn,
      data.calorieGoal,
    );
  }

  async activity(
    userId: string,
    clock: UserClock,
    days: number,
  ): Promise<ActivityHistory> {
    await this.health.syncIfStale(userId, clock);
    const data = await this.window(userId, clock, days);
    return activityHistory(
      data.dates,
      data.logsByDate,
      data.activityByDate,
      data.estimatedBurn,
    );
  }

  async nutrient(
    userId: string,
    clock: UserClock,
    nutrientId: string,
    days: number,
  ): Promise<NutrientHistory> {
    const def = (await this.catalog.nutrientDefs()).find(
      (item) => item.id === nutrientId,
    );
    if (!def) throw new NotFoundException('Nutriente não encontrado.');
    const data = await this.window(userId, clock, days);
    return nutrientHistory(data.dates, data.logsByDate, {
      id: def.id,
      name: def.name,
      unit: def.unit,
      meta: nutrientGoal(def, data.user.profile),
      ...(def.limit ? { limit: true } : {}),
    });
  }

  async plans(userId: string, clock: UserClock): Promise<PlanHistoryDay[]> {
    const dates = windowDates(clock.today, PLAN_HISTORY_DAYS + 1);
    return planHistory(await this.filledLogs(userId, dates), clock.today);
  }

  /** Fotos de cada dia de `dates`, repetindo o plano nos dias em que o app não foi aberto. */
  private async filledLogs(userId: string, dates: string[]) {
    const [logs, previous] = await Promise.all([
      this.dayLogs.find({
        where: { userId, date: Between(dates[0], dates[dates.length - 1]) },
        order: { date: 'ASC' },
      }),
      this.dayLogs.findOne({
        where: { userId, date: LessThan(dates[0]) },
        order: { date: 'DESC' },
      }),
    ]);
    return fillDayLogs(dates, logs, previous);
  }

  async sources(userId: string, clock: UserClock): Promise<ActivitySource[]> {
    await this.health.syncIfStale(userId, clock);
    const google = await this.googleAccounts.findOneBy({ userId });
    return [
      {
        name: GOOGLE_SOURCE,
        platform: 'Android',
        connected: google !== null,
        lastSync: google?.lastSync?.toISOString() ?? null,
      },
      // Apple Saúde não tem API web: só um app iOS poderia enviar os dados.
      {
        name: 'Apple Saúde',
        platform: 'iOS',
        connected: false,
        lastSync: null,
      },
    ];
  }
}
