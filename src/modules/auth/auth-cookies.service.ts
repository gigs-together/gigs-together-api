import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

/** Shared Express `res.cookie` options except `maxAge` / value. */
interface AuthCookieSharedOptions {
  readonly secure: boolean;
  readonly sameSite: 'lax' | 'strict' | 'none';
  readonly path: string;
  readonly domain?: string;
}

type CookieKind = 'access' | 'refresh';

/**
 * HttpOnly cookies for access (short) and refresh (long) JWTs. Names and flags from env (separate
 * `ACCESS_*` and `REFRESH_*` keys).
 */
@Injectable()
export class AuthCookiesService {
  constructor(private readonly configService: ConfigService) {}

  getAccessCookieName(): string {
    const raw = this.configService.get<string>('ACCESS_TOKEN_COOKIE_NAME');
    return raw?.trim() || 'gt_access';
  }

  getRefreshCookieName(): string {
    const raw = this.configService.get<string>('REFRESH_TOKEN_COOKIE_NAME');
    return raw?.trim() || 'gt_refresh';
  }

  setAccessTokenCookie(
    res: Response,
    accessToken: string,
    expiresInSec: number,
  ): void {
    /* 1000 ms = 1 s — align cookie max-age with JWT TTL (`expiresInSec`). */
    const maxAgeMs = Math.max(0, Math.floor(expiresInSec)) * 1000;
    res.cookie(this.getAccessCookieName(), accessToken, {
      httpOnly: true,
      ...this.getSharedOptions('access'),
      maxAge: maxAgeMs,
    });
  }

  setRefreshTokenCookie(
    res: Response,
    refreshToken: string,
    expiresInSec: number,
  ): void {
    const maxAgeMs = Math.max(0, Math.floor(expiresInSec)) * 1000;
    res.cookie(this.getRefreshCookieName(), refreshToken, {
      httpOnly: true,
      ...this.getSharedOptions('refresh'),
      maxAge: maxAgeMs,
    });
  }

  clearAccessTokenCookie(res: Response): void {
    res.cookie(this.getAccessCookieName(), '', {
      httpOnly: true,
      ...this.getSharedOptions('access'),
      maxAge: 0,
    });
  }

  clearRefreshTokenCookie(res: Response): void {
    res.cookie(this.getRefreshCookieName(), '', {
      httpOnly: true,
      ...this.getSharedOptions('refresh'),
      maxAge: 0,
    });
  }

  clearAllAuthCookies(res: Response): void {
    this.clearAccessTokenCookie(res);
    this.clearRefreshTokenCookie(res);
  }

  private getSharedOptions(kind: CookieKind): AuthCookieSharedOptions {
    const secure = this.resolveSecure(kind);
    const sameSite = this.resolveSameSite(kind);
    const path = '/';
    const domain = this.resolveDomain(kind);
    return {
      secure,
      sameSite,
      path,
      ...(domain ? { domain } : {}),
    };
  }

  private resolveSecure(kind: CookieKind): boolean {
    const key =
      kind === 'refresh'
        ? 'REFRESH_TOKEN_COOKIE_SECURE'
        : 'ACCESS_TOKEN_COOKIE_SECURE';
    const raw = this.configService.get<string>(key);
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

  private resolveSameSite(kind: CookieKind): 'lax' | 'strict' | 'none' {
    const key =
      kind === 'refresh'
        ? 'REFRESH_TOKEN_COOKIE_SAMESITE'
        : 'ACCESS_TOKEN_COOKIE_SAMESITE';
    const raw = (this.configService.get<string>(key) ?? 'lax')
      .trim()
      .toLowerCase();
    if (raw === 'strict' || raw === 'none') {
      return raw;
    }
    return 'lax';
  }

  private resolveDomain(kind: CookieKind): string | undefined {
    const key =
      kind === 'refresh'
        ? 'REFRESH_TOKEN_COOKIE_DOMAIN'
        : 'ACCESS_TOKEN_COOKIE_DOMAIN';
    const raw = this.configService.get<string>(key)?.trim();
    return raw || undefined;
  }
}
