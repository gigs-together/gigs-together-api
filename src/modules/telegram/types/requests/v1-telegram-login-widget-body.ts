import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

/** Body for `POST v1/auth/telegram/login-widget` (Telegram Login Widget callback payload). Same response shape as `POST v1/auth/telegram/web-app`. */
export class V1TelegramLoginWidgetBodyDto {
  @Type(() => Number)
  @IsNumber()
  id!: number;

  @IsString()
  @MinLength(1)
  first_name!: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  @Type(() => Number)
  @IsNumber()
  auth_date!: number;

  @IsString()
  @MinLength(1)
  hash!: string;
}
