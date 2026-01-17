import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ReceiverController } from './receiver.controller';
import { ReceiverService } from './receiver.service';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AuthModule } from '../auth/auth.module';
import { ReceiverExceptionFilter } from './filters/receiver-exception.filter';
import { ConsoleLogger } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ReceiverWebhookGuard } from './guards/receiver-webhook.guard';
import { ReceiverWebhookExceptionFilter } from './filters/receiver-webhook-exception.filter';

@Module({
  imports: [GigModule, TelegramModule, AuthModule, HttpModule],
  controllers: [ReceiverController],
  providers: [
    ReceiverService,
    ReceiverWebhookGuard,
    ReceiverExceptionFilter,
    ReceiverWebhookExceptionFilter,
    ConsoleLogger,
  ],
  exports: [ReceiverService],
})
export class ReceiverModule {}
