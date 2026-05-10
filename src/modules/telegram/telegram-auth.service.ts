import { ForbiddenException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { TelegramInitDataAuthExpiredError } from './telegram-init-data.errors';
import type { TelegramLoginWidgetValidationPayload } from './types/telegram-login-widget-validation-payload';

export interface TelegramInitDataParseResult {
  readonly parsedData: Record<string, string>;
  readonly dataCheckString: string;
}

@Injectable()
export class TelegramAuthService {
  parseTelegramInitDataString(initData: string): TelegramInitDataParseResult {
    const pairs = initData.split('&');
    const parsedData: Record<string, string> = {};

    pairs.forEach((pair) => {
      const [key, value] = pair.split('=');
      parsedData[key] = decodeURIComponent(value);
    });

    const keys = Object.keys(parsedData)
      .filter((key) => key !== 'hash')
      .sort();

    return {
      dataCheckString: keys
        .map((key) => `${key}=${parsedData[key]}`)
        .join('\n'),
      parsedData,
    };
  }

  validateTelegramInitData(
    dataCheckString: string,
    receivedHash: string,
  ): void {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      throw new ForbiddenException('BOT_TOKEN is not configured');
    }

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== receivedHash) {
      throw new Error('Invalid initData');
    }
  }

  /**
   * Rejects initData whose auth_date is too old (replay protection).
   * Default max age 24h; override with TELEGRAM_INIT_DATA_MAX_AGE_SEC.
   */
  validateTelegramInitDataAuthDate(authDateRaw: string | undefined): void {
    if (authDateRaw === undefined || authDateRaw === '') {
      throw new Error('Missing auth_date in Telegram initData');
    }
    const authDate = Number(authDateRaw);
    if (!Number.isFinite(authDate) || authDate <= 0) {
      throw new Error('Invalid auth_date in Telegram initData');
    }
    this.rejectTelegramAuthDateIfExpired(authDate);
  }

  /**
   * Validates Telegram Login Widget payload (browser callback) per
   * https://core.telegram.org/widgets/login#checking-authorization
   */
  validateTelegramLoginWidget(
    payload: TelegramLoginWidgetValidationPayload,
  ): void {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken?.trim()) {
      throw new ForbiddenException('Telegram bot is not configured');
    }

    const pairs: [string, string][] = [
      ['auth_date', String(payload.auth_date)],
      ['first_name', payload.first_name],
      ['id', String(payload.id)],
    ];
    if (payload.last_name !== undefined) {
      pairs.push(['last_name', payload.last_name]);
    }
    if (payload.username !== undefined) {
      pairs.push(['username', payload.username]);
    }
    if (payload.photo_url !== undefined) {
      pairs.push(['photo_url', payload.photo_url]);
    }

    pairs.sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (hmac !== payload.hash) {
      throw new ForbiddenException('Invalid Telegram login data');
    }
  }

  /**
   * Rejects Login Widget payloads whose auth_date is too old (replay protection).
   * Uses {@link rejectTelegramAuthDateIfExpired} (same window as WebApp initData).
   */
  validateTelegramLoginWidgetAuthDate(authDateSec: number): void {
    if (!Number.isFinite(authDateSec) || authDateSec <= 0) {
      throw new ForbiddenException('Invalid Telegram login auth_date');
    }
    this.rejectTelegramAuthDateIfExpired(authDateSec);
  }

  /**
   * Replay protection: rejects Unix `auth_date` older than TELEGRAM_INIT_DATA_MAX_AGE_SEC
   * (default 86_400 s = 24 h = 1_440 min).
   */
  private rejectTelegramAuthDateIfExpired(authDateSec: number): void {
    // Default 86_400 s = 24 h = 1_440 min
    const maxAgeSec = Number(
      process.env.TELEGRAM_INIT_DATA_MAX_AGE_SEC ?? 86_400,
    );
    if (!Number.isFinite(maxAgeSec) || maxAgeSec <= 0) {
      throw new Error('Invalid TELEGRAM_INIT_DATA_MAX_AGE_SEC');
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - authDateSec > maxAgeSec) {
      throw new TelegramInitDataAuthExpiredError();
    }
  }
}
