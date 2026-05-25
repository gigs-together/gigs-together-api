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
import { AuthenticatedUserGuard } from './guards/authenticated-user.guard';
import { authClientProfileFromAccessTokenIdentity } from '../../shared/mappers/auth-client-profile-from-identity';
import type { AuthClientProfileResponseBody } from '../../shared/types/auth-client-profile.types';
import type { User } from '../../shared/types/user.types';
import { tgUserToTelegramAccessIdentity } from '../telegram/mappers/access-token-user.mapper';
import { AuthService } from './auth.service';
import { AuthorizationService } from './authorization.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Returns the current session profile from the access JWT cookie (for client gates and UI bootstrap).
   * TODO: do we need to check from server cache - not just from JWT, cause it can be unactual.
   */
  @Version('1')
  @Get('me')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard)
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
    const refreshName = this.authService.getRefreshCookieName();
    const token = req.cookies?.[refreshName]?.trim();
    if (!token) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const verified = await this.authorizationService.verifyRefreshToken(token);
    const accessToken = await this.authService.signAccessToken(
      verified.identity,
    );
    const newRefresh = await this.authService.signRefreshToken(
      verified.identity,
    );
    this.authService.setAccessTokenCookie(
      res,
      accessToken,
      this.authService.getAccessExpiresInSeconds(),
    );
    this.authService.setRefreshTokenCookie(
      res,
      newRefresh,
      this.authService.getRefreshExpiresInSeconds(),
    );
    return {
      profile: authClientProfileFromAccessTokenIdentity(
        verified.identity,
        verified.isAdmin,
      ),
    };
  }

  /**
   * Clears HttpOnly access and refresh cookies (e.g. sign-out in the browser).
   */
  @Version('1')
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    this.authService.clearAllAuthCookies(res);
  }
}
