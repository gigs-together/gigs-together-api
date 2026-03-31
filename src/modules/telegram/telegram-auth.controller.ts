import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { AccessJwtService } from '../auth/access-jwt.service';
import { AuthenticatedUser } from './decorators/authenticated-user.decorator';
import { AccessJwtAuthGuard } from './guards/access-jwt-auth.guard';
import { TelegramInitDataAuthGuard } from './guards/telegram-init-data-auth.guard';
import { tgUserToTelegramAccessIdentity } from './mappers/access-token-user.mapper';
import type { User } from '../../shared/types/user.types';
import type { V1TelegramExchangeResponseBody } from './types/requests/v1-telegram-exchange-response';

@Controller('auth')
export class TelegramAuthController {
  constructor(private readonly accessJwtService: AccessJwtService) {}

  @Version('1')
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessJwtAuthGuard, TelegramInitDataAuthGuard)
  async exchange(
    @AuthenticatedUser() user: User,
  ): Promise<V1TelegramExchangeResponseBody> {
    const identity = tgUserToTelegramAccessIdentity(user.tgUser);
    const accessToken = await this.accessJwtService.signAccessToken(identity);
    return {
      accessToken,
      expiresIn: this.accessJwtService.getExpiresInSeconds(),
    };
  }
}
