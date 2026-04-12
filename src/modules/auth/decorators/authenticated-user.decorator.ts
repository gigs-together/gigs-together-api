import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { User } from '../../../shared/types/user.types';

/**
 * Injects `req.user` set by AccessJwtAuthGuard (access JWT cookie).
 */
export const AuthenticatedUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    return user;
  },
);
