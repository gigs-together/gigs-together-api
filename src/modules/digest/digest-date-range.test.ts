import {
  DIGEST_UPCOMING_RANGE_DAY_COUNT,
  getDigestUpcomingInclusiveDayRangeMs,
  getInclusiveLocalDayRangeEndMs,
  startOfLocalDayMs,
} from './digest-date-range';

describe('startOfLocalDayMs', () => {
  it('should return start-of-day timestamp in local timezone when reference time is midday', () => {
    const reference = new Date(2024, 5, 10, 15, 30, 45, 123);
    expect(startOfLocalDayMs(reference)).toBe(
      new Date(2024, 5, 10, 0, 0, 0, 0).getTime(),
    );
  });
});

describe('getInclusiveLocalDayRangeEndMs', () => {
  it('should return end of seventh inclusive local day when dayCount is seven and start is midnight', () => {
    const startOfFirstDayMs = new Date(2024, 5, 10, 0, 0, 0, 0).getTime();
    const endMs = getInclusiveLocalDayRangeEndMs({
      startOfFirstDayMs,
      dayCount: DIGEST_UPCOMING_RANGE_DAY_COUNT,
    });
    expect(endMs).toBe(new Date(2024, 5, 16, 23, 59, 59, 999).getTime());
  });

  it('should throw RangeError mentioning dayCount when dayCount is zero', () => {
    let caught: unknown;
    try {
      getInclusiveLocalDayRangeEndMs({
        startOfFirstDayMs: 0,
        dayCount: 0,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RangeError);
    if (!(caught instanceof RangeError)) {
      throw new Error('expected RangeError');
    }
    expect(caught.message).toBe('dayCount must be a positive integer');
  });

  it('should throw TypeError mentioning finite requirement when startOfFirstDayMs is NaN', () => {
    let caught: unknown;
    try {
      getInclusiveLocalDayRangeEndMs({
        startOfFirstDayMs: Number.NaN,
        dayCount: 1,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TypeError);
    if (!(caught instanceof TypeError)) {
      throw new Error('expected TypeError');
    }
    expect(caught.message).toBe('startOfFirstDayMs must be a finite number');
  });
});

describe('getDigestUpcomingInclusiveDayRangeMs', () => {
  it('should bound date range from local midnight through seventh day end when reference is late evening', () => {
    const reference = new Date(2024, 5, 10, 22, 0, 0, 0);
    const { fromMs, toMs } = getDigestUpcomingInclusiveDayRangeMs(reference);
    expect(fromMs).toBe(new Date(2024, 5, 10, 0, 0, 0, 0).getTime());
    expect(toMs).toBe(new Date(2024, 5, 16, 23, 59, 59, 999).getTime());
  });
});
