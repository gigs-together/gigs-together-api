import { Injectable } from '@nestjs/common';
import type { GigDocument } from '../gig/gig.schema';
import { GigService } from '../gig/gig.service';
import { TelegramService } from '../telegram/telegram.service';
import { getDigestUpcomingInclusiveDayRangeMs } from './digest-date-range';

interface GetPublishedGigsForDigestParams {
  /**
   * Defaults to `new Date()` when omitted so cron handlers use runtime "today";
   * tests pass an explicit instant for deterministic bounds.
   */
  readonly referenceDate?: Date;
}

/**
 * Digest Telegram publishing. Cron providers in this module should call `publish`;
 * use `ScheduleModule` from `AppModule` (already registered globally).
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
  async publish(params?: GetPublishedGigsForDigestParams): Promise<void> {
    const documents = await this.getDigestRangeDocuments(params);
    await this.telegramService.publishWeeklyDigestToMainChannel(documents);
  }

  private async getDigestRangeDocuments(
    params?: GetPublishedGigsForDigestParams,
  ): Promise<GigDocument[]> {
    const referenceDate = params?.referenceDate ?? new Date();
    const { fromMs, toMs } =
      getDigestUpcomingInclusiveDayRangeMs(referenceDate);

    return this.gigService.getPublishedGigDocumentsInInclusiveMsRange({
      fromMs,
      toMs,
    });
  }
}
