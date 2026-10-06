import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../common/auth.decorators.js';
import { Clock, type UserClock } from '../common/timezone.js';
import type { ChatMessage } from '../contract.js';
import { CHAT_SUGGESTIONS, ChatService } from './chat.service.js';

class SendMessageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Escreva uma mensagem.' })
  @MinLength(1, { message: 'Escreva uma mensagem.' })
  @MaxLength(2000, { message: 'A mensagem deve ter até 2000 caracteres.' })
  text: string;
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('messages')
  list(@CurrentUser() userId: string): Promise<ChatMessage[]> {
    return this.chat.list(userId);
  }

  @Post('messages')
  @HttpCode(200)
  send(
    @CurrentUser() userId: string,
    @Body() body: SendMessageDto,
    @Clock() clock: UserClock,
  ): Promise<ChatMessage> {
    return this.chat.send(userId, body.text, clock);
  }

  @Get('suggestions')
  suggestions(): string[] {
    return CHAT_SUGGESTIONS;
  }
}
