import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import type { DayPeriod, Diet, MealSlot, Routine } from '../contract.js';
import { MEAL_SLOTS } from './routine.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_MESSAGE = 'Informe os horários no formato HH:MM.';
const WINDOWS_MESSAGE = 'Informe os horários disponíveis para comer.';
const PERIODS = ['manha', 'tarde', 'noite'];
const MEALS_MESSAGE = 'Escolha as refeições que você faz no dia.';

class EatingWindowDto {
  @IsString({ message: TIME_MESSAGE })
  @Matches(TIME, { message: TIME_MESSAGE })
  start: string;

  @IsString({ message: TIME_MESSAGE })
  @Matches(TIME, { message: TIME_MESSAGE })
  end: string;
}

/** Rotina completa (corpo de `PUT /me/routine`); as regras entre os campos ficam em `routineError`. */
export class RoutineDto implements Routine {
  @IsArray({ message: WINDOWS_MESSAGE })
  @ValidateNested({ each: true, message: WINDOWS_MESSAGE })
  @Type(() => EatingWindowDto)
  eatingWindows: EatingWindowDto[];

  @IsString({ message: 'Informe a hora em que você acorda.' })
  @Matches(TIME, { message: 'Informe a hora em que você acorda.' })
  wakeTime: string;

  @IsString({ message: 'Informe a hora em que você dorme.' })
  @Matches(TIME, { message: 'Informe a hora em que você dorme.' })
  sleepTime: string;

  @IsString({ message: 'Informe o início do treino.' })
  @Matches(TIME, { message: 'Informe o início do treino.' })
  trainingStart: string;

  @IsString({ message: 'Informe o fim do treino.' })
  @Matches(TIME, { message: 'Informe o fim do treino.' })
  trainingEnd: string;

  @IsArray({ message: MEALS_MESSAGE })
  @ArrayUnique({ message: MEALS_MESSAGE })
  @IsIn(MEAL_SLOTS, { each: true, message: MEALS_MESSAGE })
  meals: MealSlot[];

  @IsIn(PERIODS, { message: 'Escolha o período em que sente mais fome.' })
  hungriestPeriod: DayPeriod;

  @IsIn(PERIODS, { message: 'Escolha o período em que sente menos fome.' })
  leastHungryPeriod: DayPeriod;

  @IsIn([0, 1, 2, 3, 4, 5, 6], { message: 'Escolha o dia da pesagem.' })
  weighInDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;

  @IsIn(['onivora', 'pescetariana', 'vegetariana', 'vegana'], {
    message: 'Escolha o tipo de alimentação.',
  })
  diet: Diet;
}

/** Só os campos da rotina (o DTO validado pode trazer protótipo de classe). */
export function toRoutine(dto: RoutineDto): Routine {
  return {
    eatingWindows: dto.eatingWindows.map(({ start, end }) => ({ start, end })),
    wakeTime: dto.wakeTime,
    sleepTime: dto.sleepTime,
    trainingStart: dto.trainingStart,
    trainingEnd: dto.trainingEnd,
    // Na ordem do dia, não na que veio.
    meals: MEAL_SLOTS.filter((slot) => dto.meals.includes(slot)),
    hungriestPeriod: dto.hungriestPeriod,
    leastHungryPeriod: dto.leastHungryPeriod,
    weighInDay: dto.weighInDay,
    diet: dto.diet,
  };
}
