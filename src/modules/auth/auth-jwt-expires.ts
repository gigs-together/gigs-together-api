import type { ConfigService } from '@nestjs/config';

/** Default JWT TTL: 86_400 s = 1 d = 24 h = 1_440 min. */
const DEFAULT_EXPIRES_IN_SEC = 86_400;

/**
 * JWT lifetime in seconds (must match `signOptions.expiresIn` and API `expiresIn`).
 */
export function getJwtExpiresInSeconds(config: ConfigService): number {
  const raw = config.get<string>('JWT_EXPIRES_IN_SEC');
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) {
    return Math.floor(n);
  }
  return DEFAULT_EXPIRES_IN_SEC;
}
