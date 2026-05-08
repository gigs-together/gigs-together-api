import { Module } from '@nestjs/common';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { DigestService } from './digest.service';

/**
 * Digest notifications content. ScheduleModule is registered globally in AppModule;
 * add cron providers here when wiring @Cron handlers that delegate to DigestService.
 */
@Module({
  imports: [GigModule, TelegramModule],
  providers: [DigestService],
  exports: [DigestService],
})
export class DigestModule {}
