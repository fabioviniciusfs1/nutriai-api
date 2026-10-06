import Anthropic from '@anthropic-ai/sdk';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { UserClock } from '../common/timezone.js';
import type { ChatMessage } from '../contract.js';
import { ChatMessageEntity } from '../database/entities/index.js';
import { PlanService } from '../plan/plan.service.js';
import { calculateTargets } from '../targets/targets.js';
import { UsersService } from '../users/users.service.js';
import { ANTHROPIC_CLIENT, CLAUDE_MODEL } from '../ai/anthropic.provider.js';
import { SYSTEM_PROMPT, userContext } from './chat-prompt.js';

/** Mensagens anteriores enviadas ao modelo. */
const HISTORY_LIMIT = 30;

const UNAVAILABLE =
  'O assistente está indisponível agora. Tente de novo em instantes.';
const REFUSAL_REPLY =
  'Desculpe, não posso ajudar com esse pedido. Posso tirar dúvidas sobre o seu plano alimentar, metas e alimentos.';

/** Perguntas sugeridas no painel lateral. */
export const CHAT_SUGGESTIONS = [
  'Quantas calorias devo consumir hoje?',
  'Sugira uma refeição rica em proteína',
  'Como está minha meta de carboidratos?',
  'Dicas para o jantar de hoje',
];

function toChatMessage(entity: ChatMessageEntity): ChatMessage {
  return { id: `m-${entity.id}`, role: entity.role, text: entity.text };
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: Anthropic | null,
    @InjectRepository(ChatMessageEntity)
    private readonly messages: Repository<ChatMessageEntity>,
    private readonly users: UsersService,
    private readonly plan: PlanService,
  ) {}

  /** Conversa do mais antigo para o mais recente; começa com a saudação do assistente. */
  async list(userId: string): Promise<ChatMessage[]> {
    let messages = await this.messages.find({
      where: { userId },
      order: { id: 'ASC' },
    });
    if (messages.length === 0) {
      const user = await this.users.get(userId);
      const firstName = user.name.split(/\s+/)[0];
      await this.messages.insert({
        userId,
        role: 'assistant',
        text: `Olá, ${firstName}! Sou seu assistente nutricional. Como posso te ajudar hoje?`,
      });
      messages = await this.messages.find({
        where: { userId },
        order: { id: 'ASC' },
      });
    }
    return messages.map(toChatMessage);
  }

  /** Guarda a mensagem do usuário e responde com a resposta do assistente. */
  async send(
    userId: string,
    text: string,
    clock: UserClock,
  ): Promise<ChatMessage> {
    if (!this.anthropic) throw new ServiceUnavailableException(UNAVAILABLE);
    await this.list(userId);
    const sent = await this.messages.save(
      this.messages.create({ userId, role: 'user', text }),
    );
    try {
      return await this.reply(userId, clock);
    } catch (error) {
      // Sem resposta, a pergunta não fica na conversa (o usuário tenta de novo).
      await this.messages.delete({ id: sent.id });
      throw error;
    }
  }

  private async reply(userId: string, clock: UserClock): Promise<ChatMessage> {
    const [user, history, context] = await Promise.all([
      this.users.get(userId),
      this.messages.find({
        where: { userId },
        order: { id: 'DESC' },
        take: HISTORY_LIMIT,
      }),
      this.plan.read(userId, clock, (planner) => ({
        plan: planner.todayPlan(),
        restricted: planner.restrictedFoods(),
      })),
    ]);
    const turns = history.reverse();
    // A conversa enviada ao modelo começa numa mensagem do usuário (a saudação fica de fora).
    while (turns.length > 0 && turns[0].role !== 'user') turns.shift();

    const reply = await this.ask(
      userContext({
        name: user.name,
        today: clock.today,
        profile: user.profile,
        targets: user.profile ? calculateTargets(user.profile) : null,
        ...context,
      }),
      turns.map((message) => ({ role: message.role, content: message.text })),
    );
    const saved = await this.messages.save(
      this.messages.create({ userId, role: 'assistant', text: reply }),
    );
    return toChatMessage(saved);
  }

  private async ask(
    context: string,
    messages: Anthropic.MessageParam[],
  ): Promise<string> {
    try {
      const response = await this.anthropic!.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: context },
        ],
        messages,
      });
      if (response.stop_reason === 'refusal') return REFUSAL_REPLY;
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('')
        .trim();
      if (!text)
        throw new Error(
          `resposta sem texto (stop_reason ${response.stop_reason})`,
        );
      return text;
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        this.logger.warn('Limite de requisições da API da Anthropic atingido.');
      } else if (error instanceof Anthropic.APIError) {
        this.logger.error(`API da Anthropic: ${error.status} ${error.message}`);
      } else {
        this.logger.error(
          `Chat: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw new ServiceUnavailableException(UNAVAILABLE);
    }
  }
}
