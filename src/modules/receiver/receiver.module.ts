import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ReceiverController } from './receiver.controller';
import { ReceiverService } from './receiver.service';
import {
  ReceiverCreateGigMiddleware,
  ReceiverMiddleware,
} from './receiver.middleware';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from './guards/admin.guard';
import { AntiBotGuard } from './guards/anti-bot.guard';

@Module({
  imports: [GigModule, TelegramModule, AuthModule],
  controllers: [ReceiverController],
  providers: [ReceiverService, AdminGuard, AntiBotGuard],
  exports: [ReceiverService],
})
export class ReceiverModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ReceiverMiddleware).forRoutes('telegram');
    consumer.apply(ReceiverCreateGigMiddleware).forRoutes({
      path: 'telegram/gig',
      method: RequestMethod.POST,
      version: '1',
    });
  }
}
