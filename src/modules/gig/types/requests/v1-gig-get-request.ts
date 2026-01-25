import { V1GetGigsResponseBodyGig } from '../gig.types';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';

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

  /**
   * Location filter (exact match): country + city.
   *
   * IMPORTANT:
   * - If you provide `country`, you MUST provide `city` too (and vice versa).
   * - `country` is ISO 3166-1 alpha-2 (uppercase), e.g. "ES".
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((o: V1GigGetRequestQuery) => o.country !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  city?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @ValidateIf((o: V1GigGetRequestQuery) => o.city !== undefined)
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  country?: string;
}

export interface V1GetGigsResponseBody {
  gigs: V1GetGigsResponseBodyGig[];
}
