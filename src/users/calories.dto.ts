import { IsIn } from 'class-validator';
import type { CalorieStep, CalorieStepRequest } from '../contract.js';

/** Corpo de `POST /me/calories`. */
export class CalorieStepDto implements CalorieStepRequest {
  @IsIn(['increase', 'decrease'], {
    message: 'Escolha aumentar ou diminuir as calorias.',
  })
  direction: CalorieStep;
}
