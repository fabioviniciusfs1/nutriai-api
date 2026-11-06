import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  Diet,
  MealSlot,
  Routine,
  RoutineSchedule,
  Weekday,
} from '../contract.js';
import { MAIN_MEALS, MEAL_SLOTS, WEEK } from './routine.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_MESSAGE = 'Informe os horários no formato HH:MM.';
const WINDOWS_MESSAGE = 'Informe os horários disponíveis para comer.';
const MEALS_MESSAGE = 'Escolha as refeições que você faz no dia.';
const SCHEDULES_MESSAGE = 'Informe os horários de cada grupo de dias.';
const DAYS_MESSAGE = 'Escolha os dias da semana de cada grupo.';

class EatingWindowDto {
  @IsString({ message: TIME_MESSAGE })
  @Matches(TIME, { message: TIME_MESSAGE })
  start: string;

  @IsString({ message: TIME_MESSAGE })
  @Matches(TIME, { message: TIME_MESSAGE })
  end: string;
}

/** Grupo de dias da rotina; sem `id` (ou com um desconhecido), é um grupo novo. */
class RoutineScheduleDto implements Omit<RoutineSchedule, 'id'> {
  @IsOptional()
  @IsInt({ message: SCHEDULES_MESSAGE })
  id?: number;

  @IsArray({ message: DAYS_MESSAGE })
  @ArrayUnique({ message: DAYS_MESSAGE })
  @IsIn(WEEK, { each: true, message: DAYS_MESSAGE })
  days: Weekday[];

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

  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'Informe o início do treino.' })
  @Matches(TIME, { message: 'Informe o início do treino.' })
  trainingStart: string | null;

  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'Informe o fim do treino.' })
  @Matches(TIME, { message: 'Informe o fim do treino.' })
  trainingEnd: string | null;

  /** Os lanches; as refeições principais entram sempre (`toRoutine`). */
  @IsOptional()
  @IsArray({ message: MEALS_MESSAGE })
  @ArrayUnique({ message: MEALS_MESSAGE })
  @IsIn(MEAL_SLOTS, { each: true, message: MEALS_MESSAGE })
  meals: MealSlot[] = [];
}

/** Rotina completa (corpo de `PUT /me/routine`); as regras entre os campos ficam em `routineError`. */
export class RoutineDto {
  @IsArray({ message: SCHEDULES_MESSAGE })
  @ValidateNested({ each: true, message: SCHEDULES_MESSAGE })
  @Type(() => RoutineScheduleDto)
  schedules: RoutineScheduleDto[];

  @IsIn([0, 1, 2, 3, 4, 5, 6], { message: 'Escolha o dia da pesagem.' })
  weighInDay: Weekday;

  @IsIn(['onivora', 'pescetariana', 'vegetariana', 'vegana'], {
    message: 'Escolha o tipo de alimentação.',
  })
  diet: Diet;
}

/**
 * Só os campos da rotina (o DTO validado pode trazer protótipo de classe). Os números dos grupos novos ficam em 0:
 * quem salva dá os números (`withScheduleIds`).
 */
export function toRoutine(dto: RoutineDto): Routine {
  return {
    schedules: dto.schedules.map((schedule) => ({
      id: schedule.id ?? 0,
      // Na ordem da semana, de segunda a domingo.
      days: WEEK.filter((day) => schedule.days.includes(day)),
      eatingWindows: schedule.eatingWindows.map(({ start, end }) => ({
        start,
        end,
      })),
      wakeTime: schedule.wakeTime,
      sleepTime: schedule.sleepTime,
      trainingStart: schedule.trainingStart,
      trainingEnd: schedule.trainingEnd,
      // Com as refeições principais sempre, na ordem do dia (não na que veio).
      meals: MEAL_SLOTS.filter(
        (slot) => MAIN_MEALS.includes(slot) || schedule.meals.includes(slot),
      ),
    })),
    weighInDay: dto.weighInDay,
    diet: dto.diet,
  };
}
