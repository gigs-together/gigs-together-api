import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../../../shared/types/user.types';

/**
 * Requires `req.user.isAdmin === true` (after JWT / initData guards).
 */
@Injectable()
export class RequireTelegramAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: User }>();
    if (req.user?.isAdmin !== true) {
      throw new ForbiddenException('Admin privileges required');
    }
    return true;
  }
}
