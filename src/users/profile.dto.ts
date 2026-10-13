import { IsIn, IsInt, IsNumber, Max, Min } from 'class-validator';
import type { ActivityLevel, Goal, Profile, Sex } from '../contract.js';

/** Perfil completo (corpo de `PUT /me/profile` e `POST /profile/estimate`). */
export class ProfileDto implements Profile {
  @IsIn(['feminino', 'masculino'], { message: 'Informe o sexo.' })
  sex: Sex;

  @IsInt({ message: 'A idade deve ser um número inteiro.' })
  @Min(14, { message: 'A idade deve estar entre 14 e 100 anos.' })
  @Max(100, { message: 'A idade deve estar entre 14 e 100 anos.' })
  age: number;

  @IsNumber(
    { maxDecimalPlaces: 1 },
    { message: 'O peso deve ter no máximo uma casa decimal.' },
  )
  @Min(30, { message: 'O peso deve estar entre 30 e 300 kg.' })
  @Max(300, { message: 'O peso deve estar entre 30 e 300 kg.' })
  weightKg: number;

  @IsNumber({}, { message: 'Informe a altura.' })
  @Min(120, { message: 'A altura deve estar entre 120 e 230 cm.' })
  @Max(230, { message: 'A altura deve estar entre 120 e 230 cm.' })
  heightCm: number;

  @IsIn(['sedentario', 'leve', 'moderado', 'intenso', 'extremo'], {
    message: 'Informe o nível de atividade.',
  })
  activityLevel: ActivityLevel;

  @IsIn(['perder', 'manter', 'ganhar'], { message: 'Informe o objetivo.' })
  goal: Goal;
}

/** Só os campos do perfil (o DTO validado pode trazer protótipo de classe). */
export function toProfile(dto: ProfileDto): Profile {
  const { sex, age, weightKg, heightCm, activityLevel, goal } = dto;
  return {
    sex,
    age,
    weightKg,
    heightCm,
    activityLevel,
    goal,
  };
}
