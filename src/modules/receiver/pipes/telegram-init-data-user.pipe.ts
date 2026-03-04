import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { TelegramService } from '../../telegram/telegram.service';
import { AuthService } from '../../auth/auth.service';
import type { TGUser, User } from '../../telegram/types/user.types';

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
    } catch {
      // Keep the error stable for the client.
      throw new ForbiddenException('Invalid Telegram user data');
    }
  }
}
