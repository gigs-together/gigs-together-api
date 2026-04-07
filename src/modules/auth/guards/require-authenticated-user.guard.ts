import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '../../../shared/types/user.types';

/**
 * Requires `req.user` (typically set by `AccessJwtAuthGuard`). Use after that guard on routes that
 * must not be anonymous.
 */
@Injectable()
export class RequireAuthenticatedUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: User }>();
    if (!req.user) {
      throw new UnauthorizedException('Authentication required');
    }
    return true;
  }
}
