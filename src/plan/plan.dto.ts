import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type { FoodFeedback } from '../contract.js';
import { BARCODE } from './engine/products.js';

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

export const BARCODE_MESSAGE = 'Código de barras inválido.';

/** Alimento extra: `foodName` (da base) ou `barcode` (produto do Open Food Facts). */
export class AddFoodDto {
  @IsOptional()
  @IsString({ message: 'Escolha o alimento.' })
  @MinLength(1, { message: 'Escolha o alimento.' })
  foodName?: string;

  @IsOptional()
  @IsString({ message: BARCODE_MESSAGE })
  @Matches(BARCODE, { message: BARCODE_MESSAGE })
  barcode?: string;

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

  @IsString({ message: 'Escolha o substituto.' })
  @MinLength(1, { message: 'Escolha o substituto.' })
  substitute: string;
}

/** `POST /plan/personalize`: o plano a montar de novo (sem ele, todos). */
export class PersonalizeDto {
  @IsOptional()
  @IsInt({ message: 'Plano não encontrado.' })
  planId?: number;
}
