import { Transform } from 'class-transformer';
import { IsString, Matches, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const normalizeUsername = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SignupDto {
  @Transform(trim)
  @IsString({ message: 'Informe seu nome.' })
  @MinLength(2, { message: 'Informe seu nome.' })
  name: string;

  @Transform(normalizeUsername)
  @IsString({ message: 'Informe o usuário.' })
  @Matches(/^[a-z0-9._]{3,20}$/, {
    message:
      'O usuário deve ter de 3 a 20 caracteres: letras, números, ponto ou sublinhado.',
  })
  username: string;

  @IsString({ message: 'A senha deve ter pelo menos 6 caracteres.' })
  @MinLength(6, { message: 'A senha deve ter pelo menos 6 caracteres.' })
  password: string;
}

export class LoginDto {
  @Transform(normalizeUsername)
  @IsString({ message: 'Informe usuário e senha.' })
  username: string;

  @IsString({ message: 'Informe usuário e senha.' })
  password: string;
}
