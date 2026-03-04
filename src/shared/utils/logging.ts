import { isAxiosError } from 'axios';
import type { LoggerService } from '@nestjs/common';

export function toShortJson(value: unknown, maxLen = 2000): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string')
    return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
  try {
    const s = JSON.stringify(value);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : value;
  } catch {
    return '[unserializable]';
  }
}

export function logError(
  logger: Pick<LoggerService, 'error'>,
  input: {
    error: unknown;
    note: string;
    context?: string;
    meta?: Record<string, unknown>;
  },
): void {
  const { error, note, context, meta } = input;

  if (isAxiosError(error)) {
    logger.error(
      {
        note,
        ...(meta ? { meta } : {}),
        upstream: {
          code: error.code,
          status: error.response?.status ?? null,
          message: error.message,
          request: {
            method: error.config?.method,
            url: error.config?.url,
            timeout: error.config?.timeout,
            params: toShortJson(error.config?.params),
          },
          response: {
            data: toShortJson(error.response?.data ?? null),
          },
        },
        timestamp: new Date().toISOString(),
      },
      undefined,
      context,
    );
    return;
  }

  if (error instanceof Error) {
    logger.error(
      {
        note,
        ...(meta ? { meta } : {}),
        message: error.message,
        timestamp: new Date().toISOString(),
      },
      error.stack,
      context,
    );
    return;
  }

  logger.error(
    {
      note,
      ...(meta ? { meta } : {}),
      message: typeof error === 'string' ? error : toShortJson(error),
      timestamp: new Date().toISOString(),
    },
    undefined,
    context,
  );
}
