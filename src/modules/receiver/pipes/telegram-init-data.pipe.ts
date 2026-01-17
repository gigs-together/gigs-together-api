import {
  ForbiddenException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { TelegramService } from '../../telegram/telegram.service';
import { AuthService } from '../../auth/auth.service';
import type { TGUser, User } from '../../telegram/types/user.types';
import type { V1ReceiverCreateGigRequestBody } from '../requests/v1-receiver-create-gig-request';

/**
 * Validates Telegram WebApp initData (`telegramInitDataString`) and attaches `user`
 * onto the request body for downstream handlers.
 *
 * Throws 403 on invalid/missing initData (this is a regular client endpoint, not a webhook).
 */
@Injectable()
export class TelegramInitDataPipe implements PipeTransform<any, Promise<any>> {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly authService: AuthService,
  ) {}

  async transform(value: any): Promise<any> {
    const body =
      value && typeof value === 'object' && !Array.isArray(value) ? value : {};

    const telegramInitDataString = String(
      (body as Partial<V1ReceiverCreateGigRequestBody>)
        ?.telegramInitDataString ?? '',
    );

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
      const nextBody: any = { ...body };

      // Remove raw init data after validation so it won't be persisted/logged accidentally.
      delete nextBody.telegramInitDataString;

      nextBody.user = {
        tgUser,
        isAdmin,
      } as User;

      return nextBody;
    } catch {
      // Keep the error stable for the client.
      throw new ForbiddenException('Invalid Telegram user data');
    }
  }
}
