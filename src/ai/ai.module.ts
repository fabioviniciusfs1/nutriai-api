import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmCallEntity } from '../database/entities/index.js';
import { anthropicProvider, ANTHROPIC_CLIENT } from './anthropic.provider.js';
import { LlmLogService } from './llm-log.service.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LlmCallEntity])],
  providers: [anthropicProvider, LlmLogService],
  exports: [ANTHROPIC_CLIENT, LlmLogService],
})
export class AiModule {}
