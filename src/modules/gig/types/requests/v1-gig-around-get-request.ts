import type { V1GetGigsResponseBodyGig } from '../gig.types';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { parseYyyyMmDdToMs } from './v1-gig-date-range.shared';

export class V1GigAroundGetRequestQuery {
  /**
   * Anchor date (inclusive for the "after" chunk), format: "YYYY-MM-DD" (local).
   */
  @Transform(({ value }) => parseYyyyMmDdToMs(value, 'from'))
  @IsNumber()
  anchor!: number;

  /**
   * How many gigs to load before the anchor date (strictly before).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  beforeLimit: number = 100;

  /**
   * How many gigs to load starting from the anchor date (inclusive).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  afterLimit: number = 100;

  /**
   * Location filter (exact match): country + city.
   *
   * IMPORTANT:
   * - If you provide `country`, you MUST provide `city` too (and vice versa).
   * - `country` is ISO 3166-1 alpha-2 (uppercase), e.g. "ES".
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((o: V1GigAroundGetRequestQuery) => o.country !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  city?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @ValidateIf((o: V1GigAroundGetRequestQuery) => o.city !== undefined)
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  country?: string;
}

export interface V1GigAroundGetResponseBody {
  before: V1GetGigsResponseBodyGig[];
  after: V1GetGigsResponseBodyGig[];
  prevCursor?: string;
  nextCursor?: string;
}
