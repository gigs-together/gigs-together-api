import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator, ForbiddenException } from '@nestjs/common';
import type { User } from '../../../shared/types/user.types';

/**
 * Injects `req.user` set by AccessJwtAuthGuard (Bearer JWT).
 */
export const AuthenticatedUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const req = ctx.switchToHttp().getRequest<{ user?: User }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Missing Telegram user data');
    }
    return user;
  },
);
