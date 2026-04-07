import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  Version,
} from '@nestjs/common';
import type { Response } from 'express';
import { AccessTokenCookieService } from '../auth/access-token-cookie.service';
import { TelegramAccessExchangeService } from './telegram-access-exchange.service';
import { TelegramInitDataAuthService } from './telegram-init-data-auth.service';
import { TelegramLoginWidgetAuthService } from './telegram-login-widget-auth.service';
import type { V1TelegramExchangeResponseBody } from './types/requests/v1-telegram-exchange-response';
import { V1TelegramLoginWidgetBodyDto } from './types/requests/v1-telegram-login-widget-body';
import { V1TelegramWebAppBodyDto } from './types/requests/v1-telegram-web-app-body';

@Controller('auth')
export class TelegramAuthController {
  constructor(
    private readonly accessTokenCookieService: AccessTokenCookieService,
    private readonly telegramAccessExchangeService: TelegramAccessExchangeService,
    private readonly telegramInitDataAuthService: TelegramInitDataAuthService,
    private readonly telegramLoginWidgetAuthService: TelegramLoginWidgetAuthService,
  ) {}

  /**
   * Mini App: exchange validated Web App `initData` (JSON body) for an access JWT.
   */
  @Version('1')
  @Post('telegram/web-app')
  @HttpCode(HttpStatus.OK)
  async exchangeWebApp(
    @Body() body: V1TelegramWebAppBodyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<V1TelegramExchangeResponseBody> {
    const user =
      await this.telegramInitDataAuthService.resolveUserFromInitDataString(
        body.initData,
      );
    const { accessToken, expiresIn, profile } =
      await this.telegramAccessExchangeService.buildAccessTokenExchange(
        user.tgUser,
      );
    this.accessTokenCookieService.setAccessTokenCookie(
      res,
      accessToken,
      expiresIn,
    );
    return { profile };
  }

  /**
   * Browser: exchange Telegram Login Widget callback payload for an access JWT.
   */
  @Version('1')
  @Post('telegram/login-widget')
  @HttpCode(HttpStatus.OK)
  async exchangeLoginWidget(
    @Body() body: V1TelegramLoginWidgetBodyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<V1TelegramExchangeResponseBody> {
    const user =
      await this.telegramLoginWidgetAuthService.resolveUserFromLoginWidget(
        body,
      );
    const { accessToken, expiresIn, profile } =
      await this.telegramAccessExchangeService.buildAccessTokenExchange(
        user.tgUser,
      );
    this.accessTokenCookieService.setAccessTokenCookie(
      res,
      accessToken,
      expiresIn,
    );
    return { profile };
  }
}
