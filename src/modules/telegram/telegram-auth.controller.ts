import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Version,
} from '@nestjs/common';
import { AccessJwtService } from '../auth/access-jwt.service';
import { tgUserToTelegramAccessIdentity } from './mappers/access-token-user.mapper';
import { TelegramInitDataUserPipe } from './pipes/telegram-init-data-user.pipe';
import type { V1TelegramExchangeRequestBodyValidated } from './types/requests/v1-telegram-exchange-request';
import type { V1TelegramExchangeResponseBody } from './types/requests/v1-telegram-exchange-response';

@Controller('auth')
export class TelegramAuthController {
  constructor(private readonly accessJwtService: AccessJwtService) {}

  @Version('1')
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  async exchange(
    @Body(TelegramInitDataUserPipe)
    body: V1TelegramExchangeRequestBodyValidated,
  ): Promise<V1TelegramExchangeResponseBody> {
    const identity = tgUserToTelegramAccessIdentity(body.user.tgUser);
    const accessToken = await this.accessJwtService.signAccessToken(identity);
    return {
      accessToken,
      expiresIn: this.accessJwtService.getExpiresInSeconds(),
    };
  }
}
