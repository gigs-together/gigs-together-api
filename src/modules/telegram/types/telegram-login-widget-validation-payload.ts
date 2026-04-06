/**
 * Telegram Login Widget callback fields used for HMAC verification
 * (same shape as {@link V1TelegramLoginWidgetBodyDto}).
 */
export interface TelegramLoginWidgetValidationPayload {
  readonly id: number;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly photo_url?: string;
  readonly auth_date: number;
  readonly hash: string;
}
