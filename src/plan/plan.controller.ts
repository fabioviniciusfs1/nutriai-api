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
  CreateMealPreview,
  FoodSearchResult,
  PlanFood,
  RemovalOptions,
  TodayPlan,
} from '../contract.js';
import { MEAL_NOT_FOUND } from './engine/planner.js';
import {
  AddFoodDto,
  CreateMealDto,
  MealTimeDto,
  RemovalDto,
  SwapDto,
} from './plan.dto.js';
import { PlanService } from './plan.service.js';

/** Id de refeição na URL; inválido = refeição inexistente. */
const MealId = () =>
  new ParseIntPipe({
    exceptionFactory: () => new NotFoundException(MEAL_NOT_FOUND),
  });

function requiredQuery(value: string | undefined, message: string) {
  if (!value?.trim()) throw new BadRequestException(message);
  return value.trim();
}

@Controller('plan')
export class PlanController {
  constructor(private readonly plan: PlanService) {}

  @Get('today')
  today(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
  ): Promise<TodayPlan> {
    return this.plan.read(userId, clock, (planner) => planner.todayPlan());
  }

  @Put('meals/:id/time')
  changeTime(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Param('id', MealId()) id: number,
    @Body() body: MealTimeDto,
  ): Promise<TodayPlan> {
    return this.plan.update(userId, clock, (planner) =>
      planner.changeMealTime(id, body.time),
    );
  }

  @Get('meals/:id/removal-options')
  removalOptions(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Param('id', MealId()) id: number,
  ): Promise<RemovalOptions> {
    return this.plan.read(userId, clock, (planner) =>
      planner.removalOptions(id),
    );
  }

  @Post('meals/:id/removal')
  @HttpCode(200)
  remove(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Param('id', MealId()) id: number,
    @Body() body: RemovalDto,
  ): Promise<TodayPlan> {
    return this.plan.update(userId, clock, (planner) =>
      planner.confirmRemoval(id, body.option),
    );
  }

  @Post('meal-preview')
  @HttpCode(200)
  previewMeal(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Body() body: CreateMealDto,
  ): Promise<CreateMealPreview> {
    return this.plan.previewMeal(userId, clock, body.title, body.time);
  }

  @Post('meals')
  @HttpCode(200)
  createMeal(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Body() body: CreateMealDto,
  ): Promise<TodayPlan> {
    return this.plan.createMeal(userId, clock, body.title, body.time);
  }

  @Get('meals/:id/food-search')
  searchFood(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Param('id', MealId()) id: number,
    @Query('q') q: string | undefined,
  ): Promise<FoodSearchResult> {
    const query = requiredQuery(q, 'Informe o alimento.');
    return this.plan.read(userId, clock, (planner) =>
      planner.searchFoods(id, query),
    );
  }

  @Post('meals/:id/foods')
  @HttpCode(200)
  addFood(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Param('id', MealId()) id: number,
    @Body() body: AddFoodDto,
  ): Promise<TodayPlan> {
    return this.plan.update(userId, clock, (planner) =>
      planner.addFood(id, body.foodName),
    );
  }

  @Delete('meals/:id/foods/:extraId')
  removeFood(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Param('id', MealId()) id: number,
    @Param('extraId') extraId: string,
  ): Promise<TodayPlan> {
    return this.plan.update(userId, clock, (planner) =>
      planner.removeExtraFood(id, extraId),
    );
  }

  @Get('meals/:id/substitutes')
  substitutes(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Param('id', MealId()) id: number,
    @Query('food') food: string | undefined,
  ): Promise<PlanFood[]> {
    const foodName = requiredQuery(food, 'Informe o alimento.');
    return this.plan.read(userId, clock, (planner) =>
      planner.substitutes(id, foodName),
    );
  }

  @Post('meals/:id/swaps')
  @HttpCode(200)
  swap(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
    @Param('id', MealId()) id: number,
    @Body() body: SwapDto,
  ): Promise<TodayPlan> {
    return this.plan.update(
      userId,
      clock,
      (planner) =>
        planner.swapFood(id, body.foodName, body.reason, body.substitute),
      body.foodName,
    );
  }
}
