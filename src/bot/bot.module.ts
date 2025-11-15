import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { BotMiddleware } from './bot.middleware';
import { AuthModule } from '../auth/auth.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';

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
  ],
  providers: [BotService],
  controllers: [BotController],
  exports: [BotService],
})
export class BotModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(BotMiddleware).forRoutes('bot');
  }
}
