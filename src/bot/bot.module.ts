import { MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { BotMiddleware, TelegramCreateGigMiddleware } from './bot.middleware';
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
  providers: [BotService],
  controllers: [BotController],
})
export class BotModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(BotMiddleware).forRoutes('bot');
    consumer.apply(TelegramCreateGigMiddleware).forRoutes({
      path: 'bot/gig',
      method: RequestMethod.POST,
      version: '1',
    });
  }
}
