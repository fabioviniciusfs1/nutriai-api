import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { LlmCallEntity, type LlmTask } from '../database/entities/index.js';

/** O que o log lê da resposta (`Message` e `BetaMessage` da Anthropic). */
type LlmResponse = {
  model?: string;
  stop_reason?: string | null;
  usage?: { input_tokens: number; output_tokens: number };
};

/** Grava cada chamada ao Claude em `llm_calls`, para ver o histórico de perguntas e respostas. */
@Injectable()
export class LlmLogService {
  private readonly logger = new Logger(LlmLogService.name);

  constructor(
    @InjectRepository(LlmCallEntity)
    private readonly calls: Repository<LlmCallEntity>,
  ) {}

  /**
   * Faz a chamada `call` (com os parâmetros `request`) e grava pedido, resposta ou erro, tokens e duração.
   * Devolve a resposta ou lança o erro da chamada; a falha ao gravar só vai para o log.
   */
  async track<T extends LlmResponse>(
    task: LlmTask,
    userId: string | null,
    request: { model: string },
    call: () => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    try {
      const response = await call();
      await this.save({
        task,
        userId,
        model: response.model ?? request.model,
        request,
        response,
        stopReason: response.stop_reason ?? null,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        durationMs: Date.now() - started,
        error: null,
      });
      return response;
    } catch (error) {
      await this.save({
        task,
        userId,
        model: request.model,
        request,
        response: null,
        stopReason: null,
        inputTokens: null,
        outputTokens: null,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async save(call: Omit<LlmCallEntity, 'id' | 'createdAt'>) {
    try {
      await this.calls.insert(call);
    } catch (error) {
      this.logger.warn(
        `Log da chamada ao Claude: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
