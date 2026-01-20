export function getApiPublicBase(): string {
  const explicit =
    process.env.APP_PUBLIC_BASE_URL ?? process.env.PUBLIC_BASE_URL;
  const baseRaw = (explicit ?? '').trim();
  if (!baseRaw) return '';
  const base = /^[a-z][a-z0-9+.-]*:\/\//i.test(baseRaw)
    ? baseRaw
    : `https://${baseRaw}`;
  return base.replace(/\/$/, '');
}

export function encodeS3KeyForPath(key: string): string {
  // Keep "/" separators but encode each segment.
  return key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

import { getGigPhotosPrefixWithSlash } from './gig-photos';

export function toPublicFilesProxyUrlFromStoredPhotoUrl(
  value?: string,
): string | undefined {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const base = getApiPublicBase();

  // Already a public proxy route (relative) -> optionally make absolute.
  if (trimmed.startsWith('/public/files-proxy/')) {
    return base ? new URL(trimmed, base).toString() : trimmed;
  }

  const prefix = getGigPhotosPrefixWithSlash(); // "<prefix>/"
  // Stored as S3 key path ("/<prefix>/...") -> convert to stable public proxy URL.
  const key = trimmed.startsWith(`/${prefix}`)
    ? trimmed.slice(1)
    : trimmed.startsWith(prefix)
      ? trimmed
      : undefined;
  if (!key) return trimmed;

  const encoded = encodeS3KeyForPath(key);
  const rel = `/public/files-proxy/${encoded}`;
  return base ? new URL(rel, base).toString() : rel;
}
