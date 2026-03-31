import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AccessJwtService } from '../../auth/access-jwt.service';
import { verifiedAccessTokenToUser } from '../mappers/access-token-user.mapper';

/**
 * If `Authorization: Bearer <jwt>` is present, verifies the access token and sets
 * `req.user`. When absent, TelegramInitDataAuthGuard may authenticate
 * via `X-Telegram-Init-Data`.
 */
@Injectable()
export class AccessJwtAuthGuard implements CanActivate {
  constructor(private readonly accessJwtService: AccessJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return true;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      return true;
    }
    const verified = await this.accessJwtService.verifyAccessToken(token);
    req.user = verifiedAccessTokenToUser(verified);
    return true;
  }
}
