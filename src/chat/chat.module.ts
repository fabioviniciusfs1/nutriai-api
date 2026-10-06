import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessageEntity } from '../database/entities/index.js';
import { PlanModule } from '../plan/plan.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [PlanModule, TypeOrmModule.forFeature([ChatMessageEntity])],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
