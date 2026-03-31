export interface V1TelegramExchangeResponseBody {
  accessToken: string;
  /** Access token time-to-live in seconds (informational; matches JWT `exp`). */
  expiresIn: number;
}
