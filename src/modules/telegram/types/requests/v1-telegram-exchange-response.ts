/**
 * Public Telegram user fields for client UI (no secrets). The access JWT is set as an HttpOnly cookie.
 */
export interface V1TelegramClientProfile {
  readonly displayLabel: string;
  readonly photoUrl?: string;
}

/**
 * Result of signing an access JWT and building the public profile (cookie is set by the controller).
 */
export interface V1TelegramAccessTokenExchangeResult {
  readonly accessToken: string;
  /** Access token lifetime in seconds (same as JWT `expiresIn` / sign options). */
  readonly expiresIn: number;
  readonly profile: V1TelegramClientProfile;
}

/** JSON body for Telegram auth exchange endpoints (JWT is HttpOnly; only public profile here). */
export interface V1TelegramExchangeResponseBody {
  readonly profile: V1TelegramClientProfile;
}
