import { SchedulerRegistry } from '@nestjs/schedule';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../config/app-config.js';
import { HealthSyncScheduler } from './health-sync.scheduler.js';
import type { HealthService } from './health.service.js';
import { syncStartDate } from './health.service.js';

describe('syncStartDate', () => {
  const tz = 'America/Sao_Paulo';

  it('primeira vez, no dia em que o Google foi conectado: só o dia 0', () => {
    expect(syncStartDate('2026-10-05', null, tz, '2026-10-05')).toBe(
      '2026-10-05',
    );
  });

  it('nunca importa antes do dia 0', () => {
    // Conectou há 3 dias e sincronizou ontem: os "últimos 7 dias" param no dia 0.
    expect(
      syncStartDate(
        '2026-10-05',
        new Date('2026-10-04T12:00:00Z'),
        tz,
        '2026-10-02',
      ),
    ).toBe('2026-10-02');
    // Primeira sincronização dias depois de conectar: desde o dia 0.
    expect(syncStartDate('2026-10-05', null, tz, '2026-10-01')).toBe(
      '2026-10-01',
    );
  });

  it('sincronizou ontem, conta antiga: pelo menos os últimos 7 dias', () => {
    expect(
      syncStartDate(
        '2026-10-05',
        new Date('2026-10-04T12:00:00Z'),
        tz,
        '2026-01-01',
      ),
    ).toBe('2026-09-29');
  });

  it('ficou 15 dias sem sincronizar: desde o dia da última vez, sem buraco', () => {
    expect(
      syncStartDate(
        '2026-10-05',
        new Date('2026-09-20T12:00:00Z'),
        tz,
        '2026-01-01',
      ),
    ).toBe('2026-09-20');
  });

  it('mais de 90 dias sem sincronizar: no máximo 90', () => {
    expect(
      syncStartDate(
        '2026-10-05',
        new Date('2026-01-10T12:00:00Z'),
        tz,
        '2026-01-01',
      ),
    ).toBe('2026-07-08');
  });
});

describe('HealthSyncScheduler', () => {
  const env = (extra: Record<string, string>) =>
    loadConfig({
      DATABASE_URL: 'postgres://x',
      JWT_SECRET: 'x',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_CALLBACK_URL: 'http://localhost/callback',
      TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      ...extra,
    });

  it('agenda às 03:00 de São Paulo por padrão e sincroniza todas as contas a cada disparo', async () => {
    const registry = new SchedulerRegistry();
    const syncAll = vi.fn().mockResolvedValue({ ok: 2, failed: 0 });
    const scheduler = new HealthSyncScheduler(
      env({}),
      { syncAll } as unknown as HealthService,
      registry,
    );
    scheduler.onApplicationBootstrap();

    const job = registry.getCronJob('health-sync');
    expect(job.cronTime.source).toBe('0 3 * * *');
    expect(job.cronTime.timeZone).toBe('America/Sao_Paulo');
    expect(job.isActive).toBe(true);

    await job.fireOnTick();
    expect(syncAll).toHaveBeenCalledWith('America/Sao_Paulo');

    scheduler.onApplicationShutdown();
    expect(registry.doesExist('cron', 'health-sync')).toBe(false);
  });

  it('"off" desliga', () => {
    const registry = new SchedulerRegistry();
    new HealthSyncScheduler(
      env({ HEALTH_SYNC_CRON: 'off' }),
      {} as HealthService,
      registry,
    ).onApplicationBootstrap();
    expect(registry.doesExist('cron', 'health-sync')).toBe(false);
  });

  it('sem o Google configurado, não agenda', () => {
    const registry = new SchedulerRegistry();
    new HealthSyncScheduler(
      env({ GOOGLE_CLIENT_ID: '' }),
      {} as HealthService,
      registry,
    ).onApplicationBootstrap();
    expect(registry.doesExist('cron', 'health-sync')).toBe(false);
  });

  it('horário inválido falha ao subir', () => {
    const registry = new SchedulerRegistry();
    const scheduler = new HealthSyncScheduler(
      env({ HEALTH_SYNC_CRON: 'todo dia' }),
      {} as HealthService,
      registry,
    );
    expect(() => scheduler.onApplicationBootstrap()).toThrow();
  });
});
