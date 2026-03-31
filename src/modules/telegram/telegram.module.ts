import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BucketModule } from '../bucket/bucket.module';
import { AuthModule } from '../auth/auth.module';
import { TelegramInitDataUserPipe } from './pipes/telegram-init-data-user.pipe';
import { RequireTelegramAdminPipe } from './pipes/require-telegram-admin.pipe';
import { TelegramAuthController } from './telegram-auth.controller';
import { AccessJwtAuthGuard } from './guards/access-jwt-auth.guard';
import { TelegramInitDataAuthGuard } from './guards/telegram-init-data-auth.guard';
import { TelegramInitDataAuthService } from './telegram-init-data-auth.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL: `https://api.telegram.org/bot${configService.get<string>('BOT_TOKEN')}`,
      }),
    }),
    CacheModule.register({
      ttl: 60_000 * 60,
    }),
    BucketModule,
    AuthModule,
  ],
  controllers: [TelegramAuthController],
  providers: [
    TelegramService,
    TelegramInitDataAuthService,
    TelegramInitDataUserPipe,
    RequireTelegramAdminPipe,
    AccessJwtAuthGuard,
    TelegramInitDataAuthGuard,
  ],
  exports: [
    TelegramService,
    TelegramInitDataAuthService,
    TelegramInitDataUserPipe,
    RequireTelegramAdminPipe,
    AccessJwtAuthGuard,
    TelegramInitDataAuthGuard,
    AuthModule,
  ],
})
export class TelegramModule {}
