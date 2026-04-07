import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

/** Shared Express `res.cookie` options except `maxAge` / value. */
interface AccessTokenCookieSharedOptions {
  readonly secure: boolean;
  readonly sameSite: 'lax' | 'strict' | 'none';
  readonly path: string;
  readonly domain?: string;
}

/**
 * HttpOnly cookie for the access JWT (browser clients). Name and flags come from env.
 */
@Injectable()
export class AccessTokenCookieService {
  constructor(private readonly configService: ConfigService) {}

  getCookieName(): string {
    const raw = this.configService.get<string>('ACCESS_TOKEN_COOKIE_NAME');
    return raw?.trim() || 'gt_access';
  }

  /**
   * Sets the access token cookie with a TTL matching the JWT `exp`.
   *
   * @param res
   * @param accessToken
   * @param expiresInSec Access token lifetime in seconds (same as JWT `expiresIn`).
   */
  setAccessTokenCookie(
    res: Response,
    accessToken: string,
    expiresInSec: number,
  ): void {
    /* 1000 ms = 1 s — align cookie max-age with JWT TTL (`expiresInSec`). */
    const maxAgeMs = Math.max(0, Math.floor(expiresInSec)) * 1000;
    res.cookie(this.getCookieName(), accessToken, {
      httpOnly: true,
      ...this.getSharedOptions(),
      maxAge: maxAgeMs,
    });
  }

  clearAccessTokenCookie(res: Response): void {
    res.cookie(this.getCookieName(), '', {
      httpOnly: true,
      ...this.getSharedOptions(),
      maxAge: 0,
    });
  }

  private getSharedOptions(): AccessTokenCookieSharedOptions {
    const secure = this.resolveSecureFlag();
    const sameSite = this.resolveSameSite();
    const path = '/';
    const domain = this.resolveDomain();
    return {
      secure,
      sameSite,
      path,
      ...(domain ? { domain } : {}),
    };
  }

  private resolveSecureFlag(): boolean {
    const raw = this.configService.get<string>('ACCESS_TOKEN_COOKIE_SECURE');
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
    return (
      (this.configService.get<string>('NODE_ENV') ?? '').toLowerCase() ===
      'prod'
    );
  }

  private resolveSameSite(): 'lax' | 'strict' | 'none' {
    const raw = (
      this.configService.get<string>('ACCESS_TOKEN_COOKIE_SAMESITE') ?? 'lax'
    )
      .trim()
      .toLowerCase();
    if (raw === 'strict' || raw === 'none') {
      return raw;
    }
    return 'lax';
  }

  private resolveDomain(): string | undefined {
    const raw = this.configService.get<string>('ACCESS_TOKEN_COOKIE_DOMAIN');
    const d = raw?.trim();
    return d || undefined;
  }
}
