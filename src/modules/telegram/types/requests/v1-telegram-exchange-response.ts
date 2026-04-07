/**
 * Public Telegram user fields for client UI (no secrets). The access JWT is set as an HttpOnly cookie.
 */
export interface V1TelegramClientProfile {
  readonly displayLabel: string;
  readonly photoUrl?: string;
}

/**
 * Result of signing access + refresh JWTs and building the public profile (cookies set by the controller).
 */
export interface V1TelegramAccessTokenExchangeResult {
  readonly accessToken: string;
  /** Access token lifetime in seconds. */
  readonly accessExpiresIn: number;
  readonly refreshToken: string;
  /** Refresh token lifetime in seconds. */
  readonly refreshExpiresIn: number;
  readonly profile: V1TelegramClientProfile;
}

/** JSON body for Telegram auth exchange endpoints (JWT is HttpOnly; only public profile here). */
export interface V1TelegramExchangeResponseBody {
  readonly profile: V1TelegramClientProfile;
}
