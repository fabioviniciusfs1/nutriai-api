import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { addDays, localDate, type UserClock } from '../common/timezone.js';
import type { WeightEntry } from '../contract.js';
import { WeightEntity } from '../database/entities/index.js';

/** Quantos dias no passado uma pesagem pode ser registrada. */
const MAX_DAYS_BACK = 89;
/** Tolerância para relógios um pouco adiantados. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

@Injectable()
export class WeightsService {
  constructor(
    @InjectRepository(WeightEntity)
    private readonly weights: Repository<WeightEntity>,
  ) {}

  /** Pesagens do mais antigo para o mais recente. Só histórico: não mudam o perfil nem as metas. */
  async list(userId: string): Promise<WeightEntry[]> {
    const entries = await this.weights.find({
      where: { userId },
      order: { at: 'ASC' },
    });
    return entries.map(({ id, at, kg }) => ({ id, at: at.toISOString(), kg }));
  }

  async add(
    userId: string,
    kg: number,
    rawAt: string,
    { today, timeZone }: UserClock,
  ): Promise<WeightEntry[]> {
    const at = new Date(rawAt);
    if (at.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException(
        'A data da pesagem não pode estar no futuro.',
      );
    }
    if (localDate(at, timeZone) < addDays(today, -MAX_DAYS_BACK)) {
      throw new BadRequestException(
        `A pesagem pode ser de até ${MAX_DAYS_BACK} dias atrás.`,
      );
    }
    await this.weights.insert({ userId, kg, at });
    return this.list(userId);
  }
}
