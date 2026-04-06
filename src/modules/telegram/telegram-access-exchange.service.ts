import { Injectable } from '@nestjs/common';
import { AccessJwtService } from '../auth/access-jwt.service';
import { tgUserToTelegramAccessIdentity } from './mappers/access-token-user.mapper';
import type { TGUser } from './types/user.types';
import type { V1TelegramExchangeResponseBody } from './types/requests/v1-telegram-exchange-response';

/**
 * Builds the access-token exchange response for Telegram Web App and Login Widget flows.
 */
@Injectable()
export class TelegramAccessExchangeService {
  constructor(private readonly accessJwtService: AccessJwtService) {}

  async buildAccessTokenExchangeResponse(
    tgUser: TGUser,
  ): Promise<V1TelegramExchangeResponseBody> {
    const identity = tgUserToTelegramAccessIdentity(tgUser);
    const accessToken = await this.accessJwtService.signAccessToken(identity);
    return {
      accessToken,
      expiresIn: this.accessJwtService.getExpiresInSeconds(),
    };
  }
}
