import { IsString, MinLength } from 'class-validator';

/** Body for `POST v1/auth/telegram/web-app` (Telegram Mini App `initData`). Same response shape as `POST v1/auth/telegram/login-widget`. */
export class V1TelegramWebAppBodyDto {
  @IsString()
  @MinLength(1)
  initData!: string;
}
