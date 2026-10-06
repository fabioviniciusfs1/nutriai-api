import { Controller, Delete, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../common/auth.decorators.js';
import { Clock, type UserClock } from '../common/timezone.js';
import type { RestrictedFood } from '../contract.js';
import { PlanService } from '../plan/plan.service.js';

/** Página Alimentos: alimentos marcados pelo usuário. */
@Controller('foods/restricted')
export class FoodsController {
  constructor(private readonly plan: PlanService) {}

  @Get()
  list(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
  ): Promise<RestrictedFood[]> {
    return this.plan.read(userId, clock, (planner) =>
      planner.restrictedFoods(),
    );
  }

  /** "Liberar": só tira a restrição; as trocas já feitas continuam. */
  @Delete(':name')
  async release(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Param('name') name: string,
  ): Promise<RestrictedFood[]> {
    await this.plan.update(userId, clock, (planner) =>
      planner.releaseFood(name),
    );
    return this.plan.read(userId, clock, (planner) =>
      planner.restrictedFoods(),
    );
  }
}
