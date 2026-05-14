import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DigestCronService } from './digest-cron.service';
import { DigestService } from './digest.service';

describe('DigestCronService', () => {
  let cronService: DigestCronService;

  const publishMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    publishMock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestCronService,
        {
          provide: DigestService,
          useValue: {
            publish: publishMock,
          },
        },
      ],
    }).compile();

    cronService = module.get<DigestCronService>(DigestCronService);
  });

  describe('publishWeeklyDigestScheduled', () => {
    it('should delegate to digest publish when the scheduled handler runs', async () => {
      await cronService.publishWeeklyDigestScheduled();

      expect(publishMock).toHaveBeenCalledTimes(1);
    });
  });
});
