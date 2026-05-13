import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob, CronTime } from 'cron';
import { DigestService } from './digest.service';

/**
 * Fixed IANA timezone for digest schedule (Europe/Madrid wall clock).
 */
const DIGEST_PUBLISH_TIMEZONE = 'Europe/Madrid';

/** Monday 12:00 (minute 0, hour 12, weekday Monday), five-field cron; seconds default to 0. */
const DIGEST_PUBLISH_CRON_EXPRESSION_DEFAULT = '0 12 * * 1';

const DIGEST_PUBLISH_CRON_JOB_NAME = 'digestPublish';

@Injectable()
export class DigestCronService implements OnModuleInit {
  private readonly logger = new Logger(DigestCronService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly digestService: DigestService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const fromEnv = this.readCronExpressionFromEnv();
    let cronExpression = DIGEST_PUBLISH_CRON_EXPRESSION_DEFAULT;

    if (fromEnv !== undefined) {
      const validated = CronTime.validateCronExpression(fromEnv);
      if (validated.valid) {
        cronExpression = fromEnv;
      } else {
        this.logger.warn(
          `DIGEST_PUBLISH_CRON_EXPRESSION "${fromEnv}" is invalid (${validated.error?.message ?? 'invalid pattern'}); using default "${DIGEST_PUBLISH_CRON_EXPRESSION_DEFAULT}"`,
        );
      }
    }

    const job = CronJob.from({
      cronTime: cronExpression,
      onTick: () => void this.runScheduledPublish(),
      start: false,
      timeZone: DIGEST_PUBLISH_TIMEZONE,
      name: DIGEST_PUBLISH_CRON_JOB_NAME,
    });

    this.schedulerRegistry.addCronJob(DIGEST_PUBLISH_CRON_JOB_NAME, job);
    job.start();

    this.logger.log(
      `Digest cron registered (${DIGEST_PUBLISH_CRON_JOB_NAME}): ${cronExpression} (${DIGEST_PUBLISH_TIMEZONE})`,
    );
  }

  /**
   * Handler invoked by the cron job; kept public for unit tests.
   */
  async runScheduledPublish(): Promise<void> {
    this.logger.log('Scheduled digest publish started');
    await this.digestService.publish();
  }

  private readCronExpressionFromEnv(): string | undefined {
    const raw = this.configService.get<string>(
      'DIGEST_PUBLISH_CRON_EXPRESSION',
    );
    const trimmed = raw?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }
}
