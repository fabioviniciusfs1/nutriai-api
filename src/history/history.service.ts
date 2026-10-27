import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, type Repository } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service.js';
import { localDate, type UserClock } from '../common/timezone.js';
import type {
  ActivityHistory,
  ActivitySource,
  HistorySummary,
  NutrientHistory,
  PlanHistoryEntry,
} from '../contract.js';
import {
  ActivityDayEntity,
  DayLogEntity,
  GoogleAccountEntity,
  PlanVersionEntity,
} from '../database/entities/index.js';
import { GOOGLE_SOURCE, HealthService } from '../health/health.service.js';
import { nutrientGoal } from '../nutrition/nutrient-goals.js';
import { appendEdits } from '../plan/plan-versions.js';
import { PlanService } from '../plan/plan.service.js';
import { calculateTargets, DEFAULT_CALORIE_GOAL } from '../targets/targets.js';
import { UsersService } from '../users/users.service.js';
import {
  activityHistory,
  fillDayLogs,
  historySummary,
  nutrientHistory,
  windowDates,
} from './stats.js';

/** Períodos que o front pede. */
export const PERIODS = [7, 30, 90];

/** Quantos planos `/history/plans` devolve. */
const PLAN_HISTORY_LIMIT = 50;

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
    @InjectRepository(PlanVersionEntity)
    private readonly planVersions: Repository<PlanVersionEntity>,
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
    return historySummary(data.logs, data.activityByDate, data.calorieGoal);
  }

  async activity(
    userId: string,
    clock: UserClock,
    days: number,
  ): Promise<ActivityHistory> {
    await this.health.syncIfStale(userId, clock);
    const data = await this.window(userId, clock, days);
    return activityHistory(data.dates, data.logsByDate, data.activityByDate);
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
    // Os dias começam no da criação da conta: antes dele não há consumo para mostrar (nem zerar a média).
    const created = localDate(data.user.createdAt, clock.timeZone);
    const dates = data.dates.filter((date) => date >= created);
    return nutrientHistory(dates, data.logsByDate, {
      id: def.id,
      name: def.name,
      unit: def.unit,
      meta: nutrientGoal(def, data.user.profile, data.user.dietSettings),
      ...(def.limit ? { limit: true } : {}),
    });
  }

  /** Planos do mais recente (o em vigor) para o mais antigo, cada um com o que mudou do anterior. */
  async plans(userId: string, clock: UserClock): Promise<PlanHistoryEntry[]> {
    // Lê o plano antes: a versão de agora fica gravada.
    await this.plan.read(userId, clock, () => null);
    // Um a mais, para o mais antigo da lista também ter com quem comparar.
    const [versions, catalog] = await Promise.all([
      this.planVersions.find({
        where: { userId },
        order: { id: 'DESC' },
        take: PLAN_HISTORY_LIMIT + 1,
      }),
      this.catalog.catalog(),
    ]);
    // Versões gravadas antes do campo `slot`: o da refeição base (o assistente não muda).
    const baseSlots = new Map(
      catalog.baseMeals.map((meal) => [meal.id, meal.slot]),
    );
    return versions.slice(0, PLAN_HISTORY_LIMIT).map((version, index) => {
      const previous = versions[index + 1];
      return {
        id: `p-${version.id}`,
        date: version.date,
        edited: version.edited,
        current: index === 0,
        totals: version.totals,
        meals: version.meals.map(({ id, slot, title, time, kcal, foods }) => ({
          slot: slot ?? baseSlots.get(id)!,
          title,
          time,
          kcal,
          foods,
        })),
        // Versões de antes do horário: as alterações calculadas, sem horário.
        changes: !version.edited
          ? []
          : (version.changes ??
            (previous ? appendEdits(previous.meals, version.meals, null) : [])),
      };
    });
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
    ];
  }
}
