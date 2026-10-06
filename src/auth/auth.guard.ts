import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  IS_PUBLIC,
  type AuthenticatedRequest,
} from '../common/auth.decorators.js';

export const SESSION_EXPIRED = 'Sessão expirada. Entre novamente.';

/** Exige `Authorization: Bearer <token>` em toda rota que não é `@Public()`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token)
      throw new UnauthorizedException(SESSION_EXPIRED);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ?: string }>(
        token,
      );
      // Só tokens de sessão (o `state` do Google também é um JWT, com outro `typ`).
      if (payload.typ !== 'session') throw new Error('token de outro tipo');
      request.user = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
  }
}
