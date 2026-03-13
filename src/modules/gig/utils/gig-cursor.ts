import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

export interface GigCursorDecoded {
  readonly date: number;
  readonly mongoId: string;
}

export interface GigCursorInput {
  readonly date: number;
  readonly mongoId: string;
}

function base64UrlEncode(text: string): string {
  return Buffer.from(text, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(text: string): string {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function encodeGigCursor(input: GigCursorInput): string {
  const date = Number(input.date);
  if (!Number.isFinite(date)) {
    throw new BadRequestException('Invalid cursor (date)');
  }
  const mongoId = String(input.mongoId ?? '').trim();
  if (!Types.ObjectId.isValid(mongoId)) {
    throw new BadRequestException('Invalid cursor (mongoId)');
  }
  return base64UrlEncode(`${date}:${mongoId}`);
}

export function decodeGigCursorOrThrow(raw: string): GigCursorDecoded {
  const token = String(raw ?? '').trim();
  if (!token) {
    throw new BadRequestException('cursor is required');
  }

  let decoded: string;
  try {
    decoded = base64UrlDecode(token);
  } catch {
    throw new BadRequestException('Invalid cursor');
  }

  const idx = decoded.indexOf(':');
  if (idx < 1) {
    throw new BadRequestException('Invalid cursor');
  }

  const dateStr = decoded.slice(0, idx).trim();
  const mongoId = decoded.slice(idx + 1).trim();
  const date = Number(dateStr);
  if (!Number.isFinite(date)) {
    throw new BadRequestException('Invalid cursor');
  }
  if (!Types.ObjectId.isValid(mongoId)) {
    throw new BadRequestException('Invalid cursor');
  }

  return { date, mongoId };
}
