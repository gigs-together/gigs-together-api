import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ReceiverController } from './receiver.controller';
import { ReceiverService } from './receiver.service';
import { ReceiverMiddleware } from './receiver.middleware';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from './guards/admin.guard';
import { ReceiverExceptionFilter } from './filters/receiver-exception.filter';
import { ConsoleLogger } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [GigModule, TelegramModule, AuthModule, HttpModule],
  controllers: [ReceiverController],
  providers: [
    ReceiverService,
    AdminGuard,
    ReceiverExceptionFilter,
    ConsoleLogger,
  ],
  exports: [ReceiverService],
})
export class ReceiverModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ReceiverMiddleware).forRoutes('receiver');
  }
}
