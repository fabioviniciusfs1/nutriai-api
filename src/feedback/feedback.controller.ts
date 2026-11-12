import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/auth.decorators.js';
import type { Feedback } from '../contract.js';
import { FeedbackRequestDto, toFeedbackAnswers } from './feedback.dto.js';
import { FeedbackService } from './feedback.service.js';

/** Formulário de feedback (validação do Alere.ai): uma resposta por usuário. */
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  get(@CurrentUser() userId: string): Promise<Feedback> {
    return this.feedback.get(userId);
  }

  @Post()
  submit(
    @CurrentUser() userId: string,
    @Body() body: FeedbackRequestDto,
  ): Promise<Feedback> {
    return this.feedback.submit(userId, toFeedbackAnswers(body));
  }
}
