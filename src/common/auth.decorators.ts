import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';

export const IS_PUBLIC = 'isPublic';

/** Rota aberta: não exige `Authorization: Bearer`. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export type AuthUser = { id: string };

export type AuthenticatedRequest = Request & { user?: AuthUser };

/** Id do usuário logado (definido pelo `AuthGuard`). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user!.id;
  },
);
