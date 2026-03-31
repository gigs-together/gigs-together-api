/** Thrown when `auth_date` in WebApp initData is older than the allowed window. */
export class TelegramInitDataAuthExpiredError extends Error {
  constructor(
    message = 'Telegram initData auth_date is outside the allowed window',
  ) {
    super(message);
    this.name = 'TelegramInitDataAuthExpiredError';
  }
}
