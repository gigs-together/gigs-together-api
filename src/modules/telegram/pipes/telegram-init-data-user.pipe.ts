import type { PipeTransform } from '@nestjs/common';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { TelegramInitDataAuthExpiredError } from '../telegram-init-data.errors';
import { TelegramService } from '../telegram.service';
import type { TGUser, User } from '../types/user.types';

/** Returned in JSON as `code` when initData `auth_date` is outside the allowed window. */
export const TELEGRAM_INIT_DATA_EXPIRED_CODE =
  'TELEGRAM_INIT_DATA_EXPIRED' as const;

type AnyBody = Record<string, unknown> & { telegramInitDataString?: unknown };

/**
 * Validates Telegram WebApp initData (`telegramInitDataString`) and attaches `user`.
 *
 * Removes `telegramInitDataString` from the returned object so controllers/services
 * don't accidentally rely on it.
 */
@Injectable()
export class TelegramInitDataUserPipe implements PipeTransform<
  AnyBody,
  Promise<Record<string, unknown> & { user: User }>
> {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly authService: AuthService,
  ) {}

  async transform(
    bodyRaw: AnyBody,
  ): Promise<Record<string, unknown> & { user: User }> {
    const body =
      bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
        ? (bodyRaw as AnyBody)
        : null;
    if (!body) {
      throw new BadRequestException('Body must be an object');
    }

    const telegramInitDataString =
      typeof body.telegramInitDataString === 'string'
        ? body.telegramInitDataString
        : '';

    if (!telegramInitDataString) {
      throw new ForbiddenException('Missing Telegram user data');
    }

    try {
      const { parsedData, dataCheckString } =
        this.telegramService.parseTelegramInitDataString(
          telegramInitDataString,
        );
      this.telegramService.validateTelegramInitData(
        dataCheckString,
        parsedData.hash,
      );
      this.telegramService.validateTelegramInitDataAuthDate(
        parsedData.auth_date,
      );

      const tgUser: TGUser = JSON.parse(parsedData.user);

      // TODO: explicitly check if it's a user instead of if it's a bot
      if (tgUser?.is_bot) {
        throw new ForbiddenException('Bots are not allowed');
      }

      const isAdmin = await this.authService.isAdmin(tgUser.id);
      const user: User = { tgUser, isAdmin };

      const { telegramInitDataString: _drop, ...rest } = body;
      return {
        ...rest,
        user,
      };
    } catch (e) {
      if (e instanceof TelegramInitDataAuthExpiredError) {
        throw new ForbiddenException({
          message:
            'Your Telegram session data is out of date. Please reload this page so Telegram can send fresh data — for example pull to refresh in the mini app, or close and reopen the app from the bot chat.',
          code: TELEGRAM_INIT_DATA_EXPIRED_CODE,
        });
      }
      if (e instanceof ForbiddenException) {
        throw e;
      }
      // Keep the error stable for the client.
      throw new ForbiddenException('Invalid Telegram user data');
    }
  }
}
