import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { FoodFeedback } from '../contract.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_MESSAGE = 'Informe o horário no formato HH:MM.';

/** Gramas do alimento extra: inteiro de 1 a 2000. */
export const MAX_EXTRA_GRAMS = 2000;
export const GRAMS_MESSAGE = `Informe a quantidade em gramas (1 a ${MAX_EXTRA_GRAMS}).`;

export class MealTimeDto {
  @IsString({ message: TIME_MESSAGE })
  @Matches(TIME, { message: TIME_MESSAGE })
  time: string;
}

export class AddFoodDto {
  @IsString({ message: 'Escolha o alimento.' })
  @MinLength(1, { message: 'Escolha o alimento.' })
  foodName: string;

  @IsInt({ message: GRAMS_MESSAGE })
  @Min(1, { message: GRAMS_MESSAGE })
  @Max(MAX_EXTRA_GRAMS, { message: GRAMS_MESSAGE })
  grams: number;
}

export class SwapDto {
  @IsString({ message: 'Escolha o alimento.' })
  @MinLength(1, { message: 'Escolha o alimento.' })
  foodName: string;

  @IsIn(['nao-gosto', 'nao-quero', 'nao-tenho', 'nao-posso'], {
    message: 'Escolha o motivo da troca.',
  })
  reason: FoodFeedback;

  /** `null` = o alimento sai sem substituto. */
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'Escolha o substituto.' })
  substitute: string | null;
}
