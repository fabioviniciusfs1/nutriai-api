import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CurrentUser } from '../common/auth.decorators.js';
import { Clock, type UserClock } from '../common/timezone.js';
import type {
  FoodSearchResult,
  MealTimeCheck,
  PlanFood,
  TodayPlan,
} from '../contract.js';
import { MEAL_NOT_FOUND } from './engine/planner.js';
import {
  AddFoodDto,
  GRAMS_MESSAGE,
  MAX_EXTRA_GRAMS,
  MealTimeDto,
  PersonalizeDto,
  SwapDto,
} from './plan.dto.js';
import { PLAN_NOT_FOUND, PlanService } from './plan.service.js';
import { PlanPersonalizerService } from './personalizer.service.js';

/** Id de refeição na URL; inválido = refeição inexistente. */
const MealId = () =>
  new ParseIntPipe({
    exceptionFactory: () => new NotFoundException(MEAL_NOT_FOUND),
  });

/** `?plan=<id>`: o plano do grupo de dias (sem ele, o de hoje); inválido = plano inexistente. */
export const PlanId = () => ({
  transform(value: string | undefined): number | undefined {
    if (value === undefined || value === '') return undefined;
    const id = Number(value);
    if (!Number.isInteger(id)) throw new NotFoundException(PLAN_NOT_FOUND);
    return id;
  },
});

/** Quantos nomes já mostrados o "Ver mais" pode mandar. */
const MAX_EXCLUDED = 64;

function requiredQuery(value: string | undefined, message: string) {
  if (!value?.trim()) throw new BadRequestException(message);
  return value.trim();
}

/** Gramas na query: inteiro de 1 a `MAX_EXTRA_GRAMS`. */
function gramsQuery(value: string | undefined) {
  const grams = Number(value);
  if (!Number.isInteger(grams) || grams < 1 || grams > MAX_EXTRA_GRAMS)
    throw new BadRequestException(GRAMS_MESSAGE);
  return grams;
}

@Controller('plan')
export class PlanController {
  constructor(
    private readonly plan: PlanService,
    private readonly personalizer: PlanPersonalizerService,
  ) {}

  @Get('today')
  today(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('plan', PlanId()) planId: number | undefined,
  ): Promise<TodayPlan> {
    return this.plan.read(
      userId,
      clock,
      (planner) => planner.todayPlan(),
      planId,
    );
  }

  /**
   * Monta de novo o plano individual (depois de uma falha ou de mudar a rotina; segue em segundo plano): o do
   * corpo `{ planId }`, ou todos sem ele. Responde o plano de hoje (ou o `?plan=`).
   */
  @Post('personalize')
  @HttpCode(200)
  async personalize(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('plan', PlanId()) planId: number | undefined,
    @Body() body: PersonalizeDto,
  ): Promise<TodayPlan> {
    await this.personalizer.retry(userId, body.planId);
    return this.plan.read(
      userId,
      clock,
      (planner) => planner.todayPlan(),
      planId,
    );
  }

  /** O que o assistente acha do novo horário, antes de salvar (o `PUT` salva depois). */
  @Post('meals/:id/time-check')
  @HttpCode(200)
  checkTime(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('plan', PlanId()) planId: number | undefined,
    @Param('id', MealId()) id: number,
    @Body() body: MealTimeDto,
  ): Promise<MealTimeCheck> {
    return this.plan.checkMealTime(userId, clock, id, body.time, planId);
  }

  @Put('meals/:id/time')
  changeTime(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('plan', PlanId()) planId: number | undefined,
    @Param('id', MealId()) id: number,
    @Body() body: MealTimeDto,
  ): Promise<TodayPlan> {
    return this.plan.update(
      userId,
      clock,
      (planner) => planner.changeMealTime(id, body.time),
      { planId },
    );
  }

  @Get('meals/:id/food-search')
  searchFood(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('plan', PlanId()) planId: number | undefined,
    @Param('id', MealId()) id: number,
    @Query('q') q: string | undefined,
  ): Promise<FoodSearchResult> {
    const query = requiredQuery(q, 'Informe o alimento.');
    return this.plan.read(
      userId,
      clock,
      (planner) => planner.searchFoods(id, query),
      planId,
    );
  }

  @Post('meals/:id/foods')
  @HttpCode(200)
  addFood(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('plan', PlanId()) planId: number | undefined,
    @Param('id', MealId()) id: number,
    @Body() body: AddFoodDto,
  ): Promise<TodayPlan> {
    // O alimento extra vale só no dia em que entrou: só no plano de hoje.
    return this.plan.update(
      userId,
      clock,
      (planner) => planner.addFood(id, body.foodName, body.grams),
      { planId, todayOnly: true },
    );
  }

  /** Prévia do alimento extra: `grams` gramas de `food`, com os nutrientes calculados. */
  @Get('meals/:id/food-portion')
  foodPortion(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('plan', PlanId()) planId: number | undefined,
    @Param('id', MealId()) id: number,
    @Query('food') food: string | undefined,
    @Query('grams') grams: string | undefined,
  ): Promise<PlanFood> {
    const foodName = requiredQuery(food, 'Informe o alimento.');
    const amount = gramsQuery(grams);
    return this.plan.read(
      userId,
      clock,
      (planner) => planner.foodPortion(id, foodName, amount),
      planId,
    );
  }

  @Delete('meals/:id/foods/:extraId')
  removeFood(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('plan', PlanId()) planId: number | undefined,
    @Param('id', MealId()) id: number,
    @Param('extraId') extraId: string,
  ): Promise<TodayPlan> {
    return this.plan.update(
      userId,
      clock,
      (planner) => planner.removeExtraFood(id, extraId),
      { planId },
    );
  }

  @Get('meals/:id/substitutes')
  substitutes(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('plan', PlanId()) planId: number | undefined,
    @Param('id', MealId()) id: number,
    @Query('food') food: string | undefined,
    @Query('exclude') exclude: string | string[] | undefined,
    @Query('q') q: string | undefined,
  ): Promise<PlanFood[]> {
    const foodName = requiredQuery(food, 'Informe o alimento.');
    // Pesquisa de quem já sabe o que quer comer: só o catálogo, sem o assistente.
    const query = typeof q === 'string' ? q.trim() : '';
    if (query)
      return this.plan.read(
        userId,
        clock,
        (planner) => planner.searchSubstitutes(id, foodName, query),
        planId,
      );
    // "Ver mais": os nomes já mostrados, um `exclude` por nome (os nomes da TACO têm vírgula).
    const shown = [exclude ?? []]
      .flat()
      .filter((name) => typeof name === 'string')
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, MAX_EXCLUDED);
    return this.plan.substitutes(userId, clock, id, foodName, shown, planId);
  }

  @Post('meals/:id/swaps')
  @HttpCode(200)
  swap(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Query('plan', PlanId()) planId: number | undefined,
    @Param('id', MealId()) id: number,
    @Body() body: SwapDto,
  ): Promise<TodayPlan> {
    return this.plan.update(
      userId,
      clock,
      (planner) =>
        planner.swapFood(id, body.foodName, body.reason, body.substitute),
      { flaggedFood: body.foodName, planId },
    );
  }
}
