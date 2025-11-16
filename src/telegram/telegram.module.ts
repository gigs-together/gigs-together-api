import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramCreateGigMiddleware } from './telegram.middleware';
import { GigModule } from '../gig/gig.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [GigModule, AuthModule],
  controllers: [TelegramController],
  providers: [TelegramService],
})
export class TelegramModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TelegramCreateGigMiddleware).forRoutes({
      path: 'telegram/gig',
      method: RequestMethod.POST,
      version: '1',
    });
  }
}
