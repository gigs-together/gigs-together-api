import { Module } from '@nestjs/common';
import { ReceiverController } from './receiver.controller';
import { ReceiverService } from './receiver.service';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AuthModule } from '../auth/auth.module';
import { ReceiverExceptionFilter } from './filters/receiver-exception.filter';
import { ConsoleLogger } from '@nestjs/common';
import { ReceiverWebhookGuard } from './guards/receiver-webhook.guard';
import { ReceiverWebhookExceptionFilter } from './filters/receiver-webhook-exception.filter';
import { TelegramInitDataPipe } from './pipes/telegram-init-data.pipe';
import { CalendarModule } from '../calendar/calendar.module';
import { MqModule } from '../mq/mq.module';
import { ReceiverConsumer } from './receiver.consumer';

@Module({
  imports: [GigModule, TelegramModule, AuthModule, CalendarModule, MqModule],
  controllers: [ReceiverController],
  providers: [
    ReceiverService,
    ReceiverConsumer,
    ReceiverWebhookGuard,
    ReceiverExceptionFilter,
    ReceiverWebhookExceptionFilter,
    TelegramInitDataPipe,
    ConsoleLogger,
  ],
  exports: [ReceiverService],
})
export class ReceiverModule {}
