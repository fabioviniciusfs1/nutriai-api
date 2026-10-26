import { IsIn, IsInt, IsNumber } from 'class-validator';
import type {
  DietEstimateRequest,
  DietSettings,
  MacroId,
} from '../contract.js';

/** g/kg com até duas casas decimais (os limites ficam nas regras de `targets/diet.ts`). */
function PerKg(name: string): PropertyDecorator {
  return IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: `Informe ${name} em g/kg.` },
  );
}

/** Corpo de `PUT /me/diet`. */
export class DietSettingsDto implements DietSettings {
  @PerKg('a proteína')
  proteinPerKg: number;

  @PerKg('a gordura')
  fatPerKg: number;

  @IsInt({ message: 'O peso do ovo deve ser um número inteiro de gramas.' })
  eggUnitGrams: number;
}

/** Só os campos do ajuste (o DTO validado pode trazer protótipo de classe). */
export function toDietSettings(dto: DietSettingsDto): DietSettings {
  const { proteinPerKg, fatPerKg, eggUnitGrams } = dto;
  return { proteinPerKg, fatPerKg, eggUnitGrams };
}

/** Corpo de `POST /me/diet/estimate`. */
export class DietEstimateDto implements DietEstimateRequest {
  @PerKg('a proteína')
  proteinPerKg: number;

  @PerKg('a gordura')
  fatPerKg: number;

  @IsIn(['proteinas', 'gorduras', 'carboidratos'], {
    message: 'Informe o macronutriente.',
  })
  macro: MacroId;

  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: 'Informe o valor em g/kg.' },
  )
  perKg: number;
}
