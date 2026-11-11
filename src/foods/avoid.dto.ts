import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { AvoidRule, AvoidScope } from '../contract.js';
import { MAX_AVOID_RULES } from '../plan/engine/planner.js';

/** Uma regra do "Alimentos que você não come". */
export class AvoidRuleDto implements AvoidRule {
  @IsString({ message: 'Escolha o alimento na lista.' })
  @MaxLength(120, { message: 'Escolha o alimento na lista.' })
  kind: string;

  @IsString({ message: 'Escolha o alimento na lista.' })
  @MaxLength(120, { message: 'Escolha o alimento na lista.' })
  label: string;

  @IsIn(['alimento', 'ingrediente'], {
    message: 'Escolha se tira só o alimento ou também o que leva ele.',
  })
  scope: AvoidScope;
}

/** Corpo de `PUT /foods/avoid`: a lista inteira. */
export class AvoidRulesDto {
  @IsArray({ message: 'Envie a lista de alimentos.' })
  @ArrayMaxSize(MAX_AVOID_RULES, {
    message: `Escolha no máximo ${MAX_AVOID_RULES} alimentos.`,
  })
  @ValidateNested({ each: true })
  @Type(() => AvoidRuleDto)
  rules: AvoidRuleDto[];
}

/** Só os campos da regra (o DTO validado traz protótipo de classe). */
export function toAvoidRules(dto: AvoidRulesDto): AvoidRule[] {
  return dto.rules.map(({ kind, label, scope }) => ({ kind, label, scope }));
}
