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
  type V1ReceiverCreateGigRequestBodyGig,
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

  private parseGig(value: unknown): V1ReceiverCreateGigRequestBodyGig {
    // When using multipart/form-data (e.g. uploading a file), non-file fields
    // are strings. Nested objects must be provided as JSON strings by the client.
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new BadRequestException('gig must be a JSON object');
      }
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new BadRequestException('gig must be a JSON object');
        }
        return parsed as V1ReceiverCreateGigRequestBodyGig;
      } catch {
        throw new BadRequestException('gig must be a valid JSON object');
      }
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('gig must be an object');
    }

    return value as V1ReceiverCreateGigRequestBodyGig;
  }

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

    const gig = this.parseGig(body.gig);

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
        gig,
        user,
      };
    } catch {
      // Keep the error stable for the client.
      throw new ForbiddenException('Invalid Telegram user data');
    }
  }
}
