import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { getJwtExpiresInSeconds } from './auth-jwt-expires';
import type {
  AccessTokenIdentityPayload,
  AccessTokenPayload,
  VerifiedAccessToken,
} from './types/access-token-identity.types';

function subjectFromIdentity(identity: AccessTokenIdentityPayload): string {
  switch (identity.kind) {
    case 'telegram':
      return `telegram:${identity.telegramUserId}`;
    default:
      throw new UnauthorizedException('Unsupported access token identity');
  }
}

/**
 * Signs and verifies access JWTs (provider-agnostic `identity` claim).
 */
@Injectable()
export class AccessJwtService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  getExpiresInSeconds(): number {
    return getJwtExpiresInSeconds(this.configService);
  }

  async signAccessToken(identity: AccessTokenIdentityPayload): Promise<string> {
    const sub = subjectFromIdentity(identity);
    const payload: AccessTokenPayload = { sub, identity };
    return this.jwtService.signAsync(payload);
  }

  async verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (!payload?.identity || typeof payload.identity !== 'object') {
      throw new UnauthorizedException('Invalid access token payload');
    }

    const expectedSub = subjectFromIdentity(payload.identity);
    if (payload.sub !== expectedSub) {
      throw new UnauthorizedException('Invalid access token subject');
    }

    return this.verifyIdentity(payload.identity);
  }

  private async verifyIdentity(
    identity: AccessTokenIdentityPayload,
  ): Promise<VerifiedAccessToken> {
    switch (identity.kind) {
      case 'telegram': {
        if (identity.snapshot.isBot === true) {
          throw new ForbiddenException('Bots are not allowed');
        }
        const isAdmin = await this.authService.isAdmin(identity.telegramUserId);
        return { identity, isAdmin };
      }
      default:
        throw new UnauthorizedException('Unsupported access token identity');
    }
  }
}
