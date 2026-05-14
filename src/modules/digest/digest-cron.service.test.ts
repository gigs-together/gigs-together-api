import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DigestCronService } from './digest-cron.service';
import { DigestService } from './digest.service';

describe('DigestCronService', () => {
  let cronService: DigestCronService;

  const publishIfEligibleMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    publishIfEligibleMock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestCronService,
        {
          provide: DigestService,
          useValue: {
            publishIfEligible: publishIfEligibleMock,
          },
        },
      ],
    }).compile();

    cronService = module.get<DigestCronService>(DigestCronService);
  });

  describe('onModuleInit', () => {
    it('should trigger digest publish eligibility check once', () => {
      cronService.onModuleInit();

      expect(publishIfEligibleMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('publishWeeklyDigestScheduled', () => {
    it('should delegate to digest publish eligibility when the scheduled handler runs', async () => {
      await cronService.publishWeeklyDigestScheduled();

      expect(publishIfEligibleMock).toHaveBeenCalledTimes(1);
    });
  });
});
