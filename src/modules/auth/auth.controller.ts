import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  Version,
} from '@nestjs/common';
import type { Response } from 'express';
import { AccessTokenCookieService } from './access-token-cookie.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly accessTokenCookieService: AccessTokenCookieService,
  ) {}

  /**
   * Clears the HttpOnly access cookie (e.g. sign-out in the browser).
   */
  @Version('1')
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    this.accessTokenCookieService.clearAccessTokenCookie(res);
  }
}
