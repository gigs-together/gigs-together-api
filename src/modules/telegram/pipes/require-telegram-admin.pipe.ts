import type { PipeTransform } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '../types/user.types';

type BodyAfterTelegramAuth = Record<string, unknown> & { user: User };

/**
 * Enforces {@link User.isAdmin} after {@link TelegramInitDataUserPipe}.
 *
 * Use a pipe (not a Nest guard): guards run before parameter pipes, so `user` is not on the body yet.
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
