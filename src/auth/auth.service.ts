import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { QueryFailedError, type Repository } from 'typeorm';
import type { AuthResponse } from '../contract.js';
import { UserEntity } from '../database/entities/index.js';
import type { LoginDto, SignupDto } from './auth.dto.js';

const USERNAME_TAKEN = 'Esse usuário já está em uso.';
const WRONG_CREDENTIALS = 'Usuário ou senha incorretos.';

/** Violação de `UNIQUE` no Postgres. */
export function isUniqueViolation(error: unknown) {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === '23505'
  );
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly jwt: JwtService,
  ) {}

  /** Token de sessão do usuário. */
  async issueToken(userId: string): Promise<AuthResponse> {
    return { token: await this.jwt.signAsync({ sub: userId, typ: 'session' }) };
  }

  async signup({ name, username, password }: SignupDto): Promise<AuthResponse> {
    if (await this.users.existsBy({ username }))
      throw new ConflictException(USERNAME_TAKEN);
    try {
      const user = await this.users.save(
        this.users.create({
          name,
          username,
          passwordHash: await bcrypt.hash(password, 10),
          profile: null,
        }),
      );
      return this.issueToken(user.id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(USERNAME_TAKEN);
      throw error;
    }
  }

  async login({ username, password }: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findOneBy({ username });
    // Contas criadas pelo Google não têm senha: só entram pelo Google.
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }
    return this.issueToken(user.id);
  }
}
