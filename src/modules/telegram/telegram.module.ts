import { MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import {
  TelegramMiddleware,
  TelegramCreateGigMiddleware,
} from './telegram.middleware';
import { AuthModule } from '../auth/auth.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GigModule } from '../gig/gig.module';

@Module({
  imports: [
    AuthModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL: `https://api.telegram.org/bot${configService.get<string>('BOT_TOKEN')}`,
      }),
    }),
    GigModule,
  ],
  providers: [TelegramService],
  controllers: [TelegramController],
})
export class TelegramModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TelegramMiddleware).forRoutes('telegram');
    consumer.apply(TelegramCreateGigMiddleware).forRoutes({
      path: 'telegram/gig',
      method: RequestMethod.POST,
      version: '1',
    });
  }
}
