import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { getJwtAccessExpiresInSeconds } from './auth-jwt-expires';
import { subjectFromAccessIdentity } from './subject-from-access-identity';
import type {
  AccessTokenIdentityPayload,
  AccessTokenPayload,
  VerifiedAccessToken,
} from './types/access-token-identity.types';

/** Raw JWT body after `verify` (may include `typ: 'refresh'` only if mis-signed with access secret). */
interface AccessJwtVerifiedShape {
  readonly typ?: string;
  readonly sub?: string;
  readonly identity?: unknown;
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
    return getJwtAccessExpiresInSeconds(this.configService);
  }

  async signAccessToken(identity: AccessTokenIdentityPayload): Promise<string> {
    const secret = this.requireAccessSecret();
    const sub = subjectFromAccessIdentity(identity);
    const payload: AccessTokenPayload = { sub, typ: 'access', identity };
    const expiresIn = getJwtAccessExpiresInSeconds(this.configService);
    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn,
      algorithm: 'HS256',
    });
  }

  async verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
    const secret = this.requireAccessSecret();
    /** Verified JWT shape before narrowing to {@link AccessTokenPayload} (refresh uses another secret; defense if mis-issued). */
    let payload: AccessJwtVerifiedShape;
    try {
      payload = await this.jwtService.verifyAsync<AccessJwtVerifiedShape>(
        token,
        {
          secret,
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Expected access token');
    }

    if (!payload?.identity || typeof payload.identity !== 'object') {
      throw new UnauthorizedException('Invalid access token payload');
    }

    const identity = payload.identity as AccessTokenIdentityPayload;
    const expectedSub = subjectFromAccessIdentity(identity);
    if (payload.sub !== expectedSub) {
      throw new UnauthorizedException('Invalid access token subject');
    }

    return this.verifyIdentity(identity);
  }

  private requireAccessSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret?.trim()) {
      throw new Error('JWT_SECRET is required');
    }
    return secret.trim();
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
