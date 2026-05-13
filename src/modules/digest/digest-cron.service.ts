import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DigestService } from './digest.service';

/** Monday 12:00 local (minute 0, hour 12, weekday Monday). */
const DIGEST_PUBLISH_CRON_EXPRESSION = '0 12 * * 1';
const DIGEST_PUBLISH_TIMEZONE = 'Europe/Madrid';

@Injectable()
export class DigestCronService {
  private readonly logger = new Logger(DigestCronService.name);

  constructor(private readonly digestService: DigestService) {}

  @Cron(DIGEST_PUBLISH_CRON_EXPRESSION, {
    name: 'digestWeeklyPublish',
    timeZone: DIGEST_PUBLISH_TIMEZONE,
  })
  async publishWeeklyDigestScheduled(): Promise<void> {
    this.logger.log('Scheduled weekly digest publish started');
    await this.digestService.publish();
  }
}
