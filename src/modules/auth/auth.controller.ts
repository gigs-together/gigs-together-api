import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Version,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthenticatedUser } from './decorators/authenticated-user.decorator';
import { AccessJwtAuthGuard } from './guards/access-jwt-auth.guard';
import { RequireAuthenticatedUserGuard } from './guards/require-authenticated-user.guard';
import { authClientProfileFromAccessTokenIdentity } from '../../shared/mappers/auth-client-profile-from-identity';
import type { AuthClientProfileResponseBody } from '../../shared/types/auth-client-profile.types';
import type { User } from '../../shared/types/user.types';
import { tgUserToTelegramAccessIdentity } from '../telegram/mappers/access-token-user.mapper';
import { AccessJwtService } from './access-jwt.service';
import { AuthCookiesService } from './auth-cookies.service';
import { RefreshJwtService } from './refresh-jwt.service';
import { AuthorizationService } from './authorization.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly accessJwtService: AccessJwtService,
    private readonly authCookiesService: AuthCookiesService,
    private readonly refreshJwtService: RefreshJwtService,
  ) {}

  /**
   * Returns the current session profile from the access JWT cookie (for client gates and UI bootstrap).
   * TODO: do we need to check from server cache - not just from JWT, cause it can be unactual.
   */
  @Version('1')
  @Get('me')
  @UseGuards(AccessJwtAuthGuard, RequireAuthenticatedUserGuard)
  me(@AuthenticatedUser() user: User): AuthClientProfileResponseBody {
    const identity = tgUserToTelegramAccessIdentity(user.tgUser);
    return {
      profile: authClientProfileFromAccessTokenIdentity(identity, user.isAdmin),
    };
  }

  /**
   * Issues new access + refresh cookies from a valid refresh cookie (rotation).
   */
  @Version('1')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthClientProfileResponseBody> {
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
    const isAdmin =
      identity.kind === 'telegram'
        ? await this.authorizationService.isAdmin(identity.telegramUserId)
        : false;
    return {
      profile: authClientProfileFromAccessTokenIdentity(identity, isAdmin),
    };
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
