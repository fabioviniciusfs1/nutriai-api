import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../common/auth.decorators.js';
import { Clock, type UserClock } from '../common/timezone.js';
import type { Me, Targets } from '../contract.js';
import { calculateTargets } from '../targets/targets.js';
import { ProfileDto, toProfile } from './profile.dto.js';
import { UsersService } from './users.service.js';
import { PlanPersonalizerService } from '../plan/personalizer.service.js';

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly personalizer: PlanPersonalizerService,
  ) {}

  @Get('me')
  me(@CurrentUser() userId: string, @Clock() clock: UserClock): Promise<Me> {
    return this.users.me(userId, clock);
  }

  /** Na primeira vez que o perfil é salvo, o assistente começa a montar o plano individual (em segundo plano). */
  @Put('me/profile')
  async updateProfile(
    @CurrentUser() userId: string,
    @Body() body: ProfileDto,
    @Clock() clock: UserClock,
  ): Promise<Me> {
    const first = (await this.users.get(userId)).profile === null;
    const me = await this.users.updateProfile(userId, toProfile(body), clock);
    if (first) await this.personalizer.start(userId);
    return me;
  }

  /** Metas de um perfil, sem salvar (o formulário mostra enquanto o usuário edita). */
  @Post('profile/estimate')
  @HttpCode(200)
  estimate(@Body() body: ProfileDto): Targets {
    return calculateTargets(toProfile(body));
  }
}
