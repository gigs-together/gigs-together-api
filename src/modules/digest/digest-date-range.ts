interface GetInclusiveLocalDayRangeEndMsParams {
  readonly startOfFirstDayMs: number;
  readonly dayCount: number;
}

interface DigestInclusiveDayRangeMs {
  readonly fromMs: number;
  readonly toMs: number;
}

/** Number of calendar days in the default digest date range (today inclusive). */
export const DIGEST_UPCOMING_RANGE_DAY_COUNT = 7;

export function startOfLocalDayMs(reference: Date): number {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * End of the local calendar day that is `(dayCount - 1)` days after the first day.
 * Example: dayCount 7 with start Monday 00:00 → end Sunday 23:59:59.999.
 */
export function getInclusiveLocalDayRangeEndMs(
  params: GetInclusiveLocalDayRangeEndMsParams,
): number {
  const startOfFirstDayMs = params.startOfFirstDayMs;
  const dayCount = params.dayCount;
  if (!Number.isFinite(startOfFirstDayMs)) {
    throw new TypeError('startOfFirstDayMs must be a finite number');
  }
  if (dayCount < 1 || !Number.isInteger(dayCount)) {
    throw new RangeError('dayCount must be a positive integer');
  }
  const end = new Date(startOfFirstDayMs);
  end.setDate(end.getDate() + (dayCount - 1));
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

export function getDigestUpcomingInclusiveDayRangeMs(
  reference: Date,
): DigestInclusiveDayRangeMs {
  const fromMs = startOfLocalDayMs(reference);
  const toMs = getInclusiveLocalDayRangeEndMs({
    startOfFirstDayMs: fromMs,
    dayCount: DIGEST_UPCOMING_RANGE_DAY_COUNT,
  });
  return { fromMs, toMs };
}
