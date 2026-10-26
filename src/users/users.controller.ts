import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../common/auth.decorators.js';
import { Clock, type UserClock } from '../common/timezone.js';
import type {
  DietAdjustment,
  DietPreview,
  Me,
  Targets,
  WeightProjection,
} from '../contract.js';
import { calculateTargets } from '../targets/targets.js';
import { ProfileDto, TargetWeightDto, toProfile } from './profile.dto.js';
import { RoutineDto, toRoutine } from './routine.dto.js';
import {
  DietEstimateDto,
  DietSettingsDto,
  toDietSettings,
} from './diet.dto.js';
import { UsersService } from './users.service.js';
import { PlanPersonalizerService } from '../plan/personalizer.service.js';
import { PlanService } from '../plan/plan.service.js';

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly personalizer: PlanPersonalizerService,
    private readonly plan: PlanService,
  ) {}

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

  /** O peso meta pode mudar depois do cadastro (o resto do perfil, não). */
  @Put('me/target-weight')
  updateTargetWeight(
    @CurrentUser() userId: string,
    @Body() body: TargetWeightDto,
    @Clock() clock: UserClock,
  ): Promise<Me> {
    return this.users.updateTargetWeight(
      userId,
      body.targetWeightKg ?? null,
      clock,
    );
  }

  /** Na primeira vez que a rotina é salva, o assistente começa a montar o plano individual (em segundo plano). */
  @Put('me/routine')
  async updateRoutine(
    @CurrentUser() userId: string,
    @Body() body: RoutineDto,
    @Clock() clock: UserClock,
  ): Promise<Me> {
    const first = (await this.users.get(userId)).routine === null;
    const me = await this.users.updateRoutine(userId, toRoutine(body), clock);
    if (first) await this.personalizer.start(userId);
    return me;
  }

  /** Ajuste da dieta: proteína e gordura por kg e o peso da unidade do ovo. */
  @Get('me/diet')
  diet(@CurrentUser() userId: string): Promise<DietAdjustment> {
    return this.users.diet(userId);
  }

  /** O ajuste com a mudança de um macro, sem salvar (a página chama a cada − / +). */
  @Post('me/diet/estimate')
  @HttpCode(200)
  estimateDiet(
    @CurrentUser() userId: string,
    @Body() body: DietEstimateDto,
  ): Promise<DietAdjustment> {
    return this.users.estimateDiet(userId, body);
  }

  /** O plano de hoje com o ajuste, sem salvar ("Ver prévia"). */
  @Post('me/diet/preview')
  @HttpCode(200)
  async previewDiet(
    @CurrentUser() userId: string,
    @Body() body: DietSettingsDto,
    @Clock() clock: UserClock,
  ): Promise<DietPreview> {
    const settings = toDietSettings(body);
    await this.users.checkDiet(userId, settings);
    return this.plan.previewDiet(userId, clock, settings);
  }

  @Put('me/diet')
  updateDiet(
    @CurrentUser() userId: string,
    @Body() body: DietSettingsDto,
  ): Promise<DietAdjustment> {
    return this.users.updateDiet(userId, toDietSettings(body));
  }

  /** Metas de um perfil, sem salvar (o formulário mostra enquanto o usuário edita). */
  @Post('profile/estimate')
  @HttpCode(200)
  estimate(@Body() body: ProfileDto): Targets {
    return calculateTargets(toProfile(body));
  }

  /** Em quanto tempo o perfil chega ao peso meta, sem salvar (o formulário mostra num gráfico). */
  @Post('profile/projection')
  @HttpCode(200)
  projection(
    @CurrentUser() userId: string,
    @Body() body: ProfileDto,
    @Clock() clock: UserClock,
  ): Promise<WeightProjection> {
    return this.users.projection(userId, toProfile(body), clock);
  }
}
