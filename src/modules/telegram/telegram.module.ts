import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BucketModule } from '../bucket/bucket.module';
import { AuthModule } from '../auth/auth.module';
import { TelegramInitDataUserPipe } from './pipes/telegram-init-data-user.pipe';
import { RequireTelegramAdminPipe } from './pipes/require-telegram-admin.pipe';

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
  providers: [
    TelegramService,
    TelegramInitDataUserPipe,
    RequireTelegramAdminPipe,
  ],
  exports: [
    TelegramService,
    TelegramInitDataUserPipe,
    RequireTelegramAdminPipe,
    AuthModule,
  ],
})
export class TelegramModule {}
