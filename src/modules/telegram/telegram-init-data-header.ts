import type { Request } from 'express';

/**
 * Carries Telegram Web App `initData` (query-string form) when `Authorization: Bearer` is absent.
 * Express lowercases incoming header names in `req.headers`.
 */
export const TELEGRAM_INIT_DATA_HEADER = 'X-Telegram-Init-Data' as const;

export const TELEGRAM_INIT_DATA_HEADER_LOWER =
  TELEGRAM_INIT_DATA_HEADER.toLowerCase();

export function readTelegramInitDataHeader(req: Request): string {
  const raw = req.headers[TELEGRAM_INIT_DATA_HEADER_LOWER];
  if (typeof raw === 'string') {
    return raw.trim();
  }
  if (Array.isArray(raw)) {
    return raw[0]?.trim() ?? '';
  }
  return '';
}
