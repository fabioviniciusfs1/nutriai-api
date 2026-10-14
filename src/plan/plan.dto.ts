import {
  IsIn,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { FoodFeedback } from '../contract.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_MESSAGE = 'Informe o horário no formato HH:MM.';

export class MealTimeDto {
  @IsString({ message: TIME_MESSAGE })
  @Matches(TIME, { message: TIME_MESSAGE })
  time: string;
}

export class AddFoodDto {
  @IsString({ message: 'Escolha o alimento.' })
  @MinLength(1, { message: 'Escolha o alimento.' })
  foodName: string;
}

export class SwapDto {
  @IsString({ message: 'Escolha o alimento.' })
  @MinLength(1, { message: 'Escolha o alimento.' })
  foodName: string;

  @IsIn(['nao-gosto', 'nao-quero', 'nao-tenho'], {
    message: 'Escolha o motivo da troca.',
  })
  reason: FoodFeedback;

  /** `null` = o alimento sai sem substituto. */
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'Escolha o substituto.' })
  substitute: string | null;
}
