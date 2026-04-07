import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminService } from '../admin/admin.service';
import { getJwtRefreshExpiresInSeconds } from './auth-jwt-expires';
import { subjectFromAccessIdentity } from './subject-from-access-identity';
import type { AccessTokenIdentityPayload } from './types/access-token-identity.types';
import type { RefreshTokenJwtPayload } from './types/refresh-token-jwt.types';

/**
 * Signs and verifies refresh JWTs (`typ: 'refresh'`, same `identity` as access).
 */
@Injectable()
export class RefreshJwtService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly adminService: AdminService,
    private readonly configService: ConfigService,
  ) {}

  getExpiresInSeconds(): number {
    return getJwtRefreshExpiresInSeconds(this.configService);
  }

  async signRefreshToken(
    identity: AccessTokenIdentityPayload,
  ): Promise<string> {
    const sub = subjectFromAccessIdentity(identity);
    const payload: RefreshTokenJwtPayload = { sub, typ: 'refresh', identity };
    const secret = this.requireRefreshSecret();
    const expiresIn = getJwtRefreshExpiresInSeconds(this.configService);
    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn,
      algorithm: 'HS256',
    });
  }

  async verifyRefreshToken(token: string): Promise<AccessTokenIdentityPayload> {
    const secret = this.requireRefreshSecret();
    let payload: RefreshTokenJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenJwtPayload>(
        token,
        {
          secret,
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token type');
    }

    if (!payload?.identity || typeof payload.identity !== 'object') {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    const expectedSub = subjectFromAccessIdentity(payload.identity);
    if (payload.sub !== expectedSub) {
      throw new UnauthorizedException('Invalid refresh token subject');
    }

    return this.validateIdentity(payload.identity);
  }

  private requireRefreshSecret(): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret?.trim()) {
      throw new Error('JWT_REFRESH_SECRET is required');
    }
    return secret.trim();
  }

  private async validateIdentity(
    identity: AccessTokenIdentityPayload,
  ): Promise<AccessTokenIdentityPayload> {
    switch (identity.kind) {
      case 'telegram': {
        if (identity.snapshot.isBot === true) {
          throw new ForbiddenException('Bots are not allowed');
        }
        await this.adminService.isAdmin(identity.telegramUserId);
        return identity;
      }
      default:
        throw new UnauthorizedException('Unsupported refresh token identity');
    }
  }
}
