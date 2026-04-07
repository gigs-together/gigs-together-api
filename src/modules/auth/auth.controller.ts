import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  Version,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AccessJwtService } from './access-jwt.service';
import { AuthCookiesService } from './auth-cookies.service';
import { clientProfileFromTelegramIdentity } from './client-profile-from-telegram-identity';
import { RefreshJwtService } from './refresh-jwt.service';
import type { V1TelegramExchangeResponseBody } from '../telegram/types/requests/v1-telegram-exchange-response';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly accessJwtService: AccessJwtService,
    private readonly authCookiesService: AuthCookiesService,
    private readonly refreshJwtService: RefreshJwtService,
  ) {}

  /**
   * Issues new access + refresh cookies from a valid refresh cookie (rotation).
   */
  @Version('1')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<V1TelegramExchangeResponseBody> {
    const refreshName = this.authCookiesService.getRefreshCookieName();
    const token = req.cookies?.[refreshName]?.trim();
    if (!token) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const identity = await this.refreshJwtService.verifyRefreshToken(token);
    const accessToken = await this.accessJwtService.signAccessToken(identity);
    const newRefresh = await this.refreshJwtService.signRefreshToken(identity);
    this.authCookiesService.setAccessTokenCookie(
      res,
      accessToken,
      this.accessJwtService.getExpiresInSeconds(),
    );
    this.authCookiesService.setRefreshTokenCookie(
      res,
      newRefresh,
      this.refreshJwtService.getExpiresInSeconds(),
    );
    return { profile: clientProfileFromTelegramIdentity(identity) };
  }

  /**
   * Clears HttpOnly access and refresh cookies (e.g. sign-out in the browser).
   */
  @Version('1')
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    this.authCookiesService.clearAllAuthCookies(res);
  }
}
