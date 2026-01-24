// Bucket-specific rules for gig poster images (S3 prefix, key validation, etc.)

export function getGigPostersPrefix(): string {
  const raw = (process.env.S3_POSTERS_PREFIX ?? 'gigs').trim();
  // Normalize: remove leading/trailing slashes so callers can safely do `${prefix}/...`.
  const normalized = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) return 'gigs';
  // Hardening: prevent weird traversal-ish values.
  if (normalized.includes('..') || normalized.includes('\\')) return 'gigs';
  return normalized;
}

export function getGigPostersPrefixWithSlash(): string {
  return `${getGigPostersPrefix()}/`;
}

export function isGigPosterKey(key: string): boolean {
  return key.startsWith(getGigPostersPrefixWithSlash());
}
