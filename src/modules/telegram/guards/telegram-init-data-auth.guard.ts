import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { readTelegramInitDataHeader } from '../telegram-init-data-header';
import { TelegramInitDataAuthService } from '../telegram-init-data-auth.service';

/**
 * When `req.user` is not set (no valid Bearer JWT), validates
 * `X-Telegram-Init-Data` and sets `req.user`.
 *
 * Run after AccessJwtAuthGuard.
 */
@Injectable()
export class TelegramInitDataAuthGuard implements CanActivate {
  constructor(
    private readonly telegramInitDataAuthService: TelegramInitDataAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.user) {
      return true;
    }
    const initData = readTelegramInitDataHeader(req);
    if (!initData) {
      throw new ForbiddenException('Missing Telegram user data');
    }
    req.user =
      await this.telegramInitDataAuthService.resolveUserFromInitDataString(
        initData,
      );
    return true;
  }
}
