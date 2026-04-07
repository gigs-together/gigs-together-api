import { Injectable } from '@nestjs/common';
import { AccessJwtService } from '../auth/access-jwt.service';
import { RefreshJwtService } from '../auth/refresh-jwt.service';
import { tgUserToTelegramAccessIdentity } from './mappers/access-token-user.mapper';
import type { TGUser } from './types/user.types';
import type {
  V1TelegramAccessTokenExchangeResult,
  V1TelegramClientProfile,
} from './types/requests/v1-telegram-exchange-response';

/**
 * Builds the access + refresh token exchange for Telegram Web App and Login Widget flows.
 */
@Injectable()
export class TelegramAccessExchangeService {
  constructor(
    private readonly accessJwtService: AccessJwtService,
    private readonly refreshJwtService: RefreshJwtService,
  ) {}

  /**
   * Signs access and refresh JWTs and the public profile. The caller sets HttpOnly cookies.
   */
  async buildAccessTokenExchange(
    tgUser: TGUser,
  ): Promise<V1TelegramAccessTokenExchangeResult> {
    const identity = tgUserToTelegramAccessIdentity(tgUser);
    const accessToken = await this.accessJwtService.signAccessToken(identity);
    const refreshToken =
      await this.refreshJwtService.signRefreshToken(identity);
    const accessExpiresIn = this.accessJwtService.getExpiresInSeconds();
    const refreshExpiresIn = this.refreshJwtService.getExpiresInSeconds();
    const profile = this.tgUserToClientProfile(tgUser);
    return {
      accessToken,
      accessExpiresIn,
      refreshToken,
      refreshExpiresIn,
      profile,
    };
  }

  /**
   * Non-sensitive profile for the browser (returned in JSON; tokens are HttpOnly cookies).
   */
  private tgUserToClientProfile(tg: TGUser): V1TelegramClientProfile {
    const username = tg.username;
    const displayLabel =
      typeof username === 'string' && username.trim()
        ? `@${username.trim()}`
        : tg.first_name;

    const rawPhoto = tg.photo_url;
    let photoUrl: string | undefined;
    if (typeof rawPhoto === 'string' && rawPhoto.trim()) {
      const url = rawPhoto.trim();
      if (/^https:\/\//i.test(url)) {
        photoUrl = url;
      }
    }

    return {
      displayLabel,
      ...(photoUrl ? { photoUrl } : {}),
    };
  }
}
