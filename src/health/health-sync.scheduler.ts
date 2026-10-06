import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { googleConfigured } from '../auth/google/google-oauth.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { HealthService } from './health.service.js';

const JOB_NAME = 'health-sync';

/**
 * Sincroniza todas as contas Google de madrugada (`HEALTH_SYNC_CRON`, padrão 03:00 no fuso
 * `HEALTH_SYNC_TIMEZONE`), para os dados de atividade chegarem mesmo sem o usuário abrir o app.
 * Com mais de uma instância da API, cada uma roda a sua.
 */
@Injectable()
export class HealthSyncScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(HealthSyncScheduler.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly health: HealthService,
    private readonly registry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap() {
    const { cron, timeZone } = this.config.healthSync;
    if (!cron || !googleConfigured(this.config)) return;
    const job = CronJob.from({
      cronTime: cron,
      timeZone,
      // Não começa uma rodada enquanto a anterior não terminar.
      waitForCompletion: true,
      onTick: async () => {
        const { ok, failed } = await this.health.syncAll(timeZone);
        this.logger.log(
          `Sincronização agendada com o Google: ${ok} contas ok, ${failed} com falha.`,
        );
      },
      errorHandler: (error) =>
        this.logger.error(`Sincronização agendada: ${String(error)}`),
    });
    this.registry.addCronJob(JOB_NAME, job);
    job.start();
    this.logger.log(
      `Sincronização com o Google agendada: "${cron}" (${timeZone}).`,
    );
  }

  onApplicationShutdown() {
    if (this.registry.doesExist('cron', JOB_NAME))
      this.registry.deleteCronJob(JOB_NAME);
  }
}
