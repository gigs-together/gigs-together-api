import type { PipeTransform } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '../types/user.types';

type BodyAfterTelegramAuth = Record<string, unknown> & { user: User };

/**
 * Enforces {@link User.isAdmin} on `body.user` after {@link TelegramInitDataUserPipe}
 * merged `req.authenticatedUser` into the body.
 */
@Injectable()
export class RequireTelegramAdminPipe implements PipeTransform<
  BodyAfterTelegramAuth,
  BodyAfterTelegramAuth
> {
  transform(body: BodyAfterTelegramAuth): BodyAfterTelegramAuth {
    if (body.user?.isAdmin !== true) {
      throw new ForbiddenException('Admin privileges required');
    }
    return body;
  }
}
