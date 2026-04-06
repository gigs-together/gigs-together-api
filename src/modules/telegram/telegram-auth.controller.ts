import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Version,
} from '@nestjs/common';
import { TelegramAccessExchangeService } from './telegram-access-exchange.service';
import { TelegramInitDataAuthService } from './telegram-init-data-auth.service';
import { TelegramLoginWidgetAuthService } from './telegram-login-widget-auth.service';
import type { V1TelegramExchangeResponseBody } from './types/requests/v1-telegram-exchange-response';
import { V1TelegramLoginWidgetBodyDto } from './types/requests/v1-telegram-login-widget-body';
import { V1TelegramWebAppBodyDto } from './types/requests/v1-telegram-web-app-body';

@Controller('auth')
export class TelegramAuthController {
  constructor(
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
  ): Promise<V1TelegramExchangeResponseBody> {
    const user =
      await this.telegramInitDataAuthService.resolveUserFromInitDataString(
        body.initData,
      );
    return this.telegramAccessExchangeService.buildAccessTokenExchangeResponse(
      user.tgUser,
    );
  }

  /**
   * Browser: exchange Telegram Login Widget callback payload for an access JWT.
   */
  @Version('1')
  @Post('telegram/login-widget')
  @HttpCode(HttpStatus.OK)
  async exchangeLoginWidget(
    @Body() body: V1TelegramLoginWidgetBodyDto,
  ): Promise<V1TelegramExchangeResponseBody> {
    const user =
      await this.telegramLoginWidgetAuthService.resolveUserFromLoginWidget(
        body,
      );
    return this.telegramAccessExchangeService.buildAccessTokenExchangeResponse(
      user.tgUser,
    );
  }
}
