import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth.decorators.js';
import { Clock, type UserClock } from '../common/timezone.js';
import type { AvoidOption, AvoidRule } from '../contract.js';
import { PlanService } from '../plan/plan.service.js';
import { AvoidRulesDto, toAvoidRules } from './avoid.dto.js';

/** "Alimentos que você não come": tipos de alimento que saem do plano, das sugestões e das buscas. */
@Controller('foods/avoid')
export class AvoidController {
  constructor(private readonly plan: PlanService) {}

  @Get()
  list(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
  ): Promise<AvoidRule[]> {
    return this.plan.avoidRules(userId, clock);
  }

  /** Troca a lista inteira. */
  @Put()
  save(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Body() body: AvoidRulesDto,
  ): Promise<AvoidRule[]> {
    return this.plan.saveAvoidRules(userId, clock, toAvoidRules(body));
  }

  /**
   * O tipo do alimento `food` do plano (o "Não gosto" oferece tirar todos os preparos dele); `option: null` sem
   * tipo. Em objeto: `null` sozinho iria como corpo vazio.
   */
  @Get('kind')
  async kind(
    @Query('food') food: unknown,
  ): Promise<{ option: AvoidOption | null }> {
    return {
      option: await this.plan.avoidKindOf(typeof food === 'string' ? food : ''),
    };
  }

  /** Os tipos de alimento com o texto `q` ("batata" → batata inglesa, batata doce, batata baroa…). */
  @Get('search')
  search(@Query('q') query: unknown): Promise<AvoidOption[]> {
    return this.plan.searchAvoid(typeof query === 'string' ? query : '');
  }
}
