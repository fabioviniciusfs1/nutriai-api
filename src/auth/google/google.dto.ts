import { IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleExchangeDto {
  @IsString({ message: 'O login com o Google expirou. Tente novamente.' })
  code: string;

  @IsString({ message: 'O login com o Google expirou. Tente novamente.' })
  redirectUri: string;
}

export class GoogleLinkDto {
  @IsString({ message: 'Endereço de retorno inválido.' })
  redirectUri: string;

  @IsString({ message: 'Requisição inválida.' })
  @MinLength(1, { message: 'Requisição inválida.' })
  @MaxLength(500, { message: 'Requisição inválida.' })
  state: string;
}
