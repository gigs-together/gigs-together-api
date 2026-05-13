import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DigestCronService } from './digest-cron.service';
import { DigestService } from './digest.service';

describe('DigestCronService', () => {
  let cronService: DigestCronService;

  const publishMock = vi.fn();
  const addCronJobMock = vi.fn();
  const configGetMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    publishMock.mockResolvedValue(undefined);
    configGetMock.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestCronService,
        {
          provide: DigestService,
          useValue: {
            publish: publishMock,
          },
        },
        {
          provide: SchedulerRegistry,
          useValue: {
            addCronJob: addCronJobMock,
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: configGetMock,
          },
        },
      ],
    }).compile();

    cronService = module.get<DigestCronService>(DigestCronService);
  });

  describe('runScheduledPublish', () => {
    it('should delegate to digest publish when the scheduled handler runs', async () => {
      await cronService.runScheduledPublish();

      expect(publishMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleInit', () => {
    it('should register digest cron job using env expression when set', () => {
      configGetMock.mockImplementation((key: string) =>
        key === 'DIGEST_PUBLISH_CRON_EXPRESSION' ? '15 9 * * *' : undefined,
      );

      cronService.onModuleInit();

      expect(addCronJobMock).toHaveBeenCalledTimes(1);
      expect(addCronJobMock.mock.calls[0][0]).toBe('digestPublish');
      expect(addCronJobMock.mock.calls[0][1]).toBeInstanceOf(CronJob);
    });

    it('should register digest cron job using default expression when env is unset', () => {
      cronService.onModuleInit();

      expect(addCronJobMock).toHaveBeenCalledTimes(1);
      const job = addCronJobMock.mock.calls[0][1] as CronJob;
      expect(String(job.cronTime.source)).toBe('0 12 * * 1');
    });

    it('should fall back to default cron expression and warn when env value is invalid', () => {
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation((..._args: unknown[]) => undefined);

      configGetMock.mockImplementation((key: string) =>
        key === 'DIGEST_PUBLISH_CRON_EXPRESSION' ? 'not-a-cron' : undefined,
      );

      cronService.onModuleInit();

      expect(addCronJobMock).toHaveBeenCalledTimes(1);
      const job = addCronJobMock.mock.calls[0][1] as CronJob;
      expect(String(job.cronTime.source)).toBe('0 12 * * 1');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/DIGEST_PUBLISH_CRON_EXPRESSION/),
      );

      warnSpy.mockRestore();
    });
  });
});
