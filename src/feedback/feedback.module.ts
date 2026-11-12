import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedbackResponseEntity } from '../database/entities/index.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([FeedbackResponseEntity])],
  controllers: [FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
