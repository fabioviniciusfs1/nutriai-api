import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, type Repository } from 'typeorm';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import type { Feedback, FeedbackAnswer } from '../contract.js';
import { FeedbackResponseEntity } from '../database/entities/index.js';
import {
  FEEDBACK_FORM,
  feedbackError,
  googleFormBody,
  normalizeFeedback,
} from './feedback-form.js';

/** Espera do envio ao Google Forms. */
const GOOGLE_TIMEOUT_MS = 10_000;

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectRepository(FeedbackResponseEntity)
    private readonly responses: Repository<FeedbackResponseEntity>,
  ) {}

  async get(userId: string): Promise<Feedback> {
    const response = await this.responses.findOneBy({ userId });
    return {
      form: FEEDBACK_FORM,
      response: response
        ? {
            answers: response.answers,
            answeredAt: response.createdAt.toISOString(),
          }
        : null,
    };
  }

  /** Grava a resposta (uma por usuário) e manda uma cópia ao Google Forms; a falha lá não quebra a rota. */
  async submit(userId: string, raw: FeedbackAnswer[]): Promise<Feedback> {
    const error = feedbackError(raw);
    if (error) throw new BadRequestException(error);
    const answers = normalizeFeedback(raw);
    try {
      await this.responses.insert({ userId, answers });
    } catch (err) {
      // 23505: já existe resposta (chave primária `user_id`).
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException('Você já respondeu o formulário.');
      throw err;
    }
    await this.sendToGoogle(userId, answers);
    return this.get(userId);
  }

  private async sendToGoogle(userId: string, answers: FeedbackAnswer[]) {
    const url = this.config.feedbackGoogleFormUrl;
    if (!url) return;
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: googleFormBody(answers),
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Google Forms respondeu ${res.status}`);
      await this.responses.update(
        { userId },
        { googleSentAt: new Date(), googleError: null },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Feedback de ${userId} não foi ao Google Forms: ${message}`,
      );
      await this.responses.update({ userId }, { googleError: message });
    }
  }
}
