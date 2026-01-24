import { V1GetGigsResponseBodyGig } from '../gig.types';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

const startOfTodayMs = (): number => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Parses "YYYY-MM-DD" into local-day bounds.
 * - for "from": start of day (00:00:00.000)
 * - for "to": end of day (23:59:59.999)
 *
 * We intentionally keep formats strict to avoid timezone surprises.
 */
const parseYyyyMmDdToMs = (raw: unknown, field: 'from' | 'to'): number => {
  if (typeof raw !== 'string') return NaN;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const [y, m, d] = s.split('-').map((x) => Number(x));
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return NaN;
  if (field === 'to') dt.setHours(23, 59, 59, 999);
  else dt.setHours(0, 0, 0, 0);
  return dt.getTime();
};

export class V1GigGetRequestQuery {
  /**
   * Pagination.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size: number = 100;

  /**
   * Date range bounds (inclusive), format: "YYYY-MM-DD" (local).
   */
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? startOfTodayMs()
      : parseYyyyMmDdToMs(value, 'from'),
  )
  @IsNumber()
  from: number = startOfTodayMs();

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : parseYyyyMmDdToMs(value, 'to'),
  )
  @IsNumber()
  to?: number;
}

export interface V1GetGigsResponseBody {
  gigs: V1GetGigsResponseBodyGig[];
}
