import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../common/auth.decorators.js';
import { Clock, type UserClock } from '../common/timezone.js';
import type { Me, Targets } from '../contract.js';
import { calculateTargets } from '../targets/targets.js';
import { ProfileDto, toProfile } from './profile.dto.js';
import { UsersService } from './users.service.js';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() userId: string, @Clock() clock: UserClock): Promise<Me> {
    return this.users.me(userId, clock);
  }

  @Put('me/profile')
  updateProfile(
    @CurrentUser() userId: string,
    @Body() body: ProfileDto,
    @Clock() clock: UserClock,
  ): Promise<Me> {
    return this.users.updateProfile(userId, toProfile(body), clock);
  }

  /** Metas de um perfil, sem salvar (o formulário mostra enquanto o usuário edita). */
  @Post('profile/estimate')
  @HttpCode(200)
  estimate(@Body() body: ProfileDto): Targets {
    return calculateTargets(toProfile(body));
  }
}
