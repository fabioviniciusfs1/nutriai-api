import { Transform } from 'class-transformer';
import {
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { FoodFeedback, RemoveMealOption } from '../contract.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_MESSAGE = 'Informe o horário no formato HH:MM.';

export class MealTimeDto {
  @IsString({ message: TIME_MESSAGE })
  @Matches(TIME, { message: TIME_MESSAGE })
  time: string;
}

export class RemovalDto {
  @IsIn(['suggest', 'redistribute', 'nothing'], {
    message: 'Escolha o que fazer com a refeição.',
  })
  option: RemoveMealOption;
}

export class CreateMealDto {
  @Transform(trim)
  @IsString({ message: 'Informe o nome da refeição.' })
  @MinLength(1, { message: 'Informe o nome da refeição.' })
  @MaxLength(60, { message: 'O nome da refeição deve ter até 60 caracteres.' })
  title: string;

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
