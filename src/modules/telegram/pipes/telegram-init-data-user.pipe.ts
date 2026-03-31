import type { PipeTransform } from '@nestjs/common';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import type { User } from '../types/user.types';

type AnyBody = Record<string, unknown>;

function normalizeBody(bodyRaw: unknown): AnyBody {
  if (bodyRaw === undefined || bodyRaw === null) {
    return {};
  }
  if (typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)) {
    return bodyRaw as AnyBody;
  }
  throw new BadRequestException('Body must be an object');
}

/**
 * Merges `user` from `req.authenticatedUser` (set by AccessJwtAuthGuard and/or
 * TelegramInitDataAuthGuard) into the parsed body for downstream pipes/controllers.
 */
@Injectable({ scope: Scope.REQUEST })
export class TelegramInitDataUserPipe implements PipeTransform<
  AnyBody,
  Promise<Record<string, unknown> & { user: User }>
> {
  constructor(@Inject(REQUEST) private readonly req: Request) {}

  async transform(
    bodyRaw: AnyBody,
  ): Promise<Record<string, unknown> & { user: User }> {
    const body = normalizeBody(bodyRaw);
    const user = this.req.authenticatedUser;
    if (!user) {
      throw new ForbiddenException('Missing Telegram user data');
    }
    return {
      ...body,
      user,
    };
  }
}
