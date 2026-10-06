import { IsISO8601, IsNumber, Max, Min } from 'class-validator';

export class AddWeightDto {
  @IsNumber(
    { maxDecimalPlaces: 1 },
    { message: 'O peso deve ter no máximo uma casa decimal.' },
  )
  @Min(30, { message: 'O peso deve estar entre 30 e 300 kg.' })
  @Max(300, { message: 'O peso deve estar entre 30 e 300 kg.' })
  kg: number;

  @IsISO8601({ strict: true }, { message: 'Informe a data da pesagem.' })
  at: string;
}
