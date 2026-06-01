import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const ADMIN_GIG_LIST_STATUS_QUERY_VALUES = [
  'pending',
  'published',
  'rejected',
] as const;

export type AdminGigListStatusQuery =
  (typeof ADMIN_GIG_LIST_STATUS_QUERY_VALUES)[number];

export class V1AdminGigsGetQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(ADMIN_GIG_LIST_STATUS_QUERY_VALUES)
  status!: AdminGigListStatusQuery;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 100;
}
