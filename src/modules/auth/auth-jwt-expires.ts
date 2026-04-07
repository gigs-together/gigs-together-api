import type { ConfigService } from '@nestjs/config';

/** Default access JWT TTL: 3_600 s = 1 h = 60 min. */
const DEFAULT_ACCESS_EXPIRES_IN_SEC = 3_600;

/** Default refresh JWT TTL: 2_592_000 s = 30 d = 720 h. */
const DEFAULT_REFRESH_EXPIRES_IN_SEC = 2_592_000;

/**
 * Access JWT lifetime in seconds (short-lived). Uses `JWT_ACCESS_EXPIRES_IN_SEC`, or default.
 */
export function getJwtAccessExpiresInSeconds(config: ConfigService): number {
  const raw = config.get<string>('JWT_ACCESS_EXPIRES_IN_SEC');
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) {
    return Math.floor(n);
  }
  return DEFAULT_ACCESS_EXPIRES_IN_SEC;
}

/**
 * Refresh JWT lifetime in seconds (long-lived, rotation on use).
 */
export function getJwtRefreshExpiresInSeconds(config: ConfigService): number {
  const raw = config.get<string>('JWT_REFRESH_EXPIRES_IN_SEC');
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) {
    return Math.floor(n);
  }
  return DEFAULT_REFRESH_EXPIRES_IN_SEC;
}
