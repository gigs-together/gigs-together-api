import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AccessTokenCookieService } from '../../auth/access-token-cookie.service';
import { AccessJwtService } from '../../auth/access-jwt.service';
import { verifiedAccessTokenToUser } from '../mappers/access-token-user.mapper';

/**
 * If an access JWT is present, verifies it and sets `req.user`. When absent, leaves `req.user`
 * unset; pair with an auth-required guard or `AuthenticatedUser` where the route must not be anonymous.
 *
 * Token resolution order:
 * 1. HttpOnly access cookie (browser; primary for the web app).
 * 2. `Authorization: Bearer` — optional fallback for the same JWT: non-browser clients (curl,
 *    Postman, integration tests), scripts, and local debugging without wiring cookies. The SPA does
 *    not send Bearer; keeping this path does not weaken HttpOnly protection in the browser.
 */
@Injectable()
export class AccessJwtAuthGuard implements CanActivate {
  constructor(
    private readonly accessJwtService: AccessJwtService,
    private readonly accessTokenCookieService: AccessTokenCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { cookies?: Record<string, string | undefined> }>();
    const cookieName = this.accessTokenCookieService.getCookieName();
    const fromCookie = req.cookies?.[cookieName]?.trim() ?? '';
    const header = req.headers.authorization;
    const fromBearer = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : '';
    const token = fromCookie || fromBearer;
    if (!token) {
      return true;
    }
    const verified = await this.accessJwtService.verifyAccessToken(token);
    req.user = verifiedAccessTokenToUser(verified);
    return true;
  }
}
