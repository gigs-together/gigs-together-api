import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AccessJwtService } from '../access-jwt.service';
import { AuthCookiesService } from '../auth-cookies.service';
import { verifiedAccessTokenToUser } from '../../telegram/mappers/access-token-user.mapper';

/**
 * If an access JWT is present in the HttpOnly cookie, verifies it and sets `req.user`. When absent,
 * leaves `req.user` unset; pair with an auth-required guard or `AuthenticatedUser` where the route
 * must not be anonymous.
 */
@Injectable()
export class AccessJwtAuthGuard implements CanActivate {
  constructor(
    private readonly accessJwtService: AccessJwtService,
    private readonly authCookiesService: AuthCookiesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { cookies?: Record<string, string | undefined> }>();
    const cookieName = this.authCookiesService.getAccessCookieName();
    const token = req.cookies?.[cookieName]?.trim() ?? '';
    if (!token) {
      return true;
    }
    const verified = await this.accessJwtService.verifyAccessToken(token);
    req.user = verifiedAccessTokenToUser(verified);
    return true;
  }
}
