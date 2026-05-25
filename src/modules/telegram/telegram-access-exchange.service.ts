import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { tgUserToTelegramAccessIdentity } from './mappers/access-token-user.mapper';
import type { TGUser } from './types/user.types';
import type { V1TelegramAccessTokenExchangeResult } from './types/requests/v1-telegram-exchange-response';
import { authClientProfileFromAccessTokenIdentity } from '../../shared/mappers/auth-client-profile-from-identity';

/**
 * Builds the access + refresh token exchange for Telegram Web App and Login Widget flows.
 */
@Injectable()
export class TelegramAccessExchangeService {
  constructor(private readonly authService: AuthService) {}

  /**
   * Signs access and refresh JWTs and the public profile. The caller sets HttpOnly cookies.
   */
  async buildAccessTokenExchange(user: {
    readonly tgUser: TGUser;
    readonly isAdmin: boolean;
  }): Promise<V1TelegramAccessTokenExchangeResult> {
    const identity = tgUserToTelegramAccessIdentity(user.tgUser);
    const accessToken = await this.authService.signAccessToken(identity);
    const refreshToken = await this.authService.signRefreshToken(identity);
    const accessExpiresIn = this.authService.getAccessExpiresInSeconds();
    const refreshExpiresIn = this.authService.getRefreshExpiresInSeconds();
    const profile = authClientProfileFromAccessTokenIdentity(
      identity,
      user.isAdmin,
    );
    return {
      accessToken,
      accessExpiresIn,
      refreshToken,
      refreshExpiresIn,
      profile,
    };
  }
}
