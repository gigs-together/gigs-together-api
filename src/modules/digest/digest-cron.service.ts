import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DigestService,
  DIGEST_PUBLISH_CRON_EXPRESSION,
  DIGEST_PUBLISH_TIMEZONE,
} from './digest.service';

@Injectable()
export class DigestCronService implements OnModuleInit {
  private readonly logger = new Logger(DigestCronService.name);

  constructor(private readonly digestService: DigestService) {}

  onModuleInit(): void {
    void this.digestService.publishIfEligible();
  }

  @Cron(DIGEST_PUBLISH_CRON_EXPRESSION, {
    name: 'digestWeeklyPublish',
    timeZone: DIGEST_PUBLISH_TIMEZONE,
  })
  async publishWeeklyDigestScheduled(): Promise<void> {
    this.logger.log('Scheduled weekly digest publish started');
    await this.digestService.publishIfEligible();
  }
}
