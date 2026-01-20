// Bucket-specific rules for gig poster images (S3 prefix, key validation, etc.)

export function getGigPhotosPrefix(): string {
  const raw = (process.env.S3_POSTERS_PREFIX ?? 'gigs').trim();
  // Normalize: remove leading/trailing slashes so callers can safely do `${prefix}/...`.
  const normalized = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) return 'gigs';
  // Hardening: prevent weird traversal-ish values.
  if (normalized.includes('..') || normalized.includes('\\')) return 'gigs';
  return normalized;
}

export function getGigPhotosPrefixWithSlash(): string {
  return `${getGigPhotosPrefix()}/`;
}

export function isGigPhotoKey(key: string): boolean {
  return key.startsWith(getGigPhotosPrefixWithSlash());
}

export function toStoredGigPhotoPathFromKey(key: string): string {
  // Store only bucket key path as "/<prefix>/<file>" so other modules can
  // convert it to proxy/redirect URLs later.
  return `/${key}`;
}
