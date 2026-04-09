import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { AdminModule } from '../admin/admin.module';
import { BucketModule } from '../bucket/bucket.module';
import { AuthModule } from '../auth/auth.module';
import { TelegramAuthController } from './telegram-auth.controller';
import { TelegramInitDataAuthService } from './telegram-init-data-auth.service';
import { TelegramAccessExchangeService } from './telegram-access-exchange.service';
import { TelegramLoginWidgetAuthService } from './telegram-login-widget-auth.service';

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
    AdminModule,
    AuthModule,
  ],
  controllers: [TelegramAuthController],
  providers: [
    TelegramService,
    TelegramInitDataAuthService,
    TelegramAccessExchangeService,
    TelegramLoginWidgetAuthService,
  ],
  exports: [TelegramService, TelegramInitDataAuthService],
})
export class TelegramModule {}
