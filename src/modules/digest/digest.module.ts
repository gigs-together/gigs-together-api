import { Module } from '@nestjs/common';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { DigestCronService } from './digest-cron.service';
import { DigestController } from './digest.controller';
import { DigestPublishGuard } from './guards/digest-publish.guard';
import { DigestService } from './digest.service';

/**
 * Digest notifications; weekly Telegram publish on a fixed schedule (Europe/Madrid).
 */
@Module({
  imports: [GigModule, TelegramModule],
  controllers: [DigestController],
  providers: [DigestService, DigestCronService, DigestPublishGuard],
  exports: [DigestService],
})
export class DigestModule {}
