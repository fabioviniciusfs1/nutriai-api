import { Global, Module } from '@nestjs/common';
import { anthropicProvider, ANTHROPIC_CLIENT } from './anthropic.provider.js';

@Global()
@Module({
  providers: [anthropicProvider],
  exports: [ANTHROPIC_CLIENT],
})
export class AiModule {}
