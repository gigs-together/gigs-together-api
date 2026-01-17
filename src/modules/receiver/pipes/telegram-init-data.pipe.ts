import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { TelegramService } from '../../telegram/telegram.service';
import { AuthService } from '../../auth/auth.service';
import type { TGUser, User } from '../../telegram/types/user.types';
import {
  V1ReceiverCreateGigRequestBody,
  V1ReceiverCreateGigRequestBodyValidated,
} from '../types/requests/v1-receiver-create-gig-request';

/**
 * Validates Telegram WebApp initData (`telegramInitDataString`) and attaches `user`
 * onto the request body for downstream handlers.
 *
 * Throws 403 on invalid/missing initData (this is a regular client endpoint, not a webhook).
 */
@Injectable()
export class TelegramInitDataPipe
  implements
    PipeTransform<
      V1ReceiverCreateGigRequestBody,
      Promise<V1ReceiverCreateGigRequestBodyValidated>
    >
{
  constructor(
    private readonly telegramService: TelegramService,
    private readonly authService: AuthService,
  ) {}

  async transform(
    bodyRaw: V1ReceiverCreateGigRequestBody,
  ): Promise<V1ReceiverCreateGigRequestBodyValidated> {
    const body =
      bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
        ? bodyRaw
        : null;
    if (!body) {
      throw new BadRequestException('Body must be an object');
    }

    if (!body.telegramInitDataString) {
      throw new ForbiddenException('Missing Telegram user data');
    }

    try {
      const { parsedData, dataCheckString } =
        this.telegramService.parseTelegramInitDataString(
          body.telegramInitDataString,
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
      const user: User = {
        tgUser,
        isAdmin,
      };

      return {
        gig: body.gig,
        user,
      };
    } catch {
      // Keep the error stable for the client.
      throw new ForbiddenException('Invalid Telegram user data');
    }
  }
}
