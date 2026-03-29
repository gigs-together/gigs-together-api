import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class V1GigByPublicIdGetRequestParams {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/)
  publicId!: string;
}

export class V1GigByPublicIdGetRequestQuery {
  /**
   * Location filter (exact match): country + city.
   *
   * IMPORTANT:
   * - If you provide `country`, you MUST provide `city` too (and vice versa).
   * - `country` is ISO 3166-1 alpha-2 (uppercase), e.g. "ES".
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((o: V1GigByPublicIdGetRequestQuery) => o.country !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  city?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @ValidateIf((o: V1GigByPublicIdGetRequestQuery) => o.city !== undefined)
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  country?: string;
}

export interface V1GigByPublicIdGetInput {
  publicId: string;
  city?: string;
  country?: string;
}

/**
 * Minimal published gig payload for resolving deep links (e.g. hash → scroll anchor date).
 * Intentionally omits feed-only fields (poster, calendarUrl, postUrl, …) to avoid extra work.
 */
export interface V1PublishedGigByPublicIdGig {
  id: string;
  date: string;
}

export interface V1GigByPublicIdGetResponseBody {
  gig: V1PublishedGigByPublicIdGig;
}
