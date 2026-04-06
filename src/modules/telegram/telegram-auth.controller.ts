import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { AuthenticatedUser } from './decorators/authenticated-user.decorator';
import { AccessJwtAuthGuard } from './guards/access-jwt-auth.guard';
import { TelegramInitDataAuthGuard } from './guards/telegram-init-data-auth.guard';
import { TelegramAccessExchangeService } from './telegram-access-exchange.service';
import { TelegramLoginWidgetAuthService } from './telegram-login-widget-auth.service';
import type { User } from '../../shared/types/user.types';
import type { V1TelegramExchangeResponseBody } from './types/requests/v1-telegram-exchange-response';
import { V1TelegramLoginWidgetBodyDto } from './types/requests/v1-telegram-login-widget-body';

@Controller('auth')
export class TelegramAuthController {
  constructor(
    private readonly telegramAccessExchangeService: TelegramAccessExchangeService,
    private readonly telegramLoginWidgetAuthService: TelegramLoginWidgetAuthService,
  ) {}

  /**
   * Mini App: exchange validated Web App `initData` (header `X-Telegram-Init-Data`) for an access JWT.
   */
  @Version('1')
  @Post('telegram/web-app')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessJwtAuthGuard, TelegramInitDataAuthGuard)
  async exchangeWebApp(
    @AuthenticatedUser() user: User,
  ): Promise<V1TelegramExchangeResponseBody> {
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
