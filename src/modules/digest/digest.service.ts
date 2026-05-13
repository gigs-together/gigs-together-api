import { Injectable } from '@nestjs/common';
import type { GigDocument } from '../gig/gig.schema';
import { GigService } from '../gig/gig.service';
import { TelegramService } from '../telegram/telegram.service';
import { getDigestUpcomingInclusiveDayRangeMs } from './digest-date-range';

/**
 * Digest Telegram publishing. {@link DigestCronService} triggers `publish` on a weekly schedule.
 */
@Injectable()
export class DigestService {
  constructor(
    private readonly gigService: GigService,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * Publishes the weekly digest to the main Telegram channel (album + caption, or empty-range notice).
   */
  async publish(): Promise<void> {
    const documents = await this.getDigestRangeDocuments();
    await this.telegramService.publishWeeklyDigestToMainChannel(documents);
  }

  private async getDigestRangeDocuments(): Promise<GigDocument[]> {
    const { fromMs, toMs } = getDigestUpcomingInclusiveDayRangeMs(new Date());

    return this.gigService.getPublishedGigDocumentsInInclusiveMsRange({
      fromMs,
      toMs,
    });
  }
}
