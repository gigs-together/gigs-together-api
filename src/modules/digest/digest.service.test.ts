import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { DigestService } from './digest.service';
import { Gig } from '../gig/gig.schema';
import { GigService } from '../gig/gig.service';
import { AiService } from '../ai/ai.service';
import { CalendarService } from '../calendar/calendar.service';
import { GigPosterService } from '../gig/gig.poster.service';
import { TelegramService } from '../telegram/telegram.service';
import { BucketService } from '../bucket/bucket.service';
import { Status } from '../gig/types/status.enum';

describe('DigestService', () => {
  let service: DigestService;

  const execMock = vi.fn();
  const sortMock = vi.fn().mockReturnValue({ exec: execMock });
  const collationMock = vi.fn().mockReturnValue({ sort: sortMock });
  const findMock = vi.fn().mockReturnValue({ collation: collationMock });
  const publishWeeklyDigestToMainChannelMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    execMock.mockResolvedValue([]);
    publishWeeklyDigestToMainChannelMock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestService,
        GigService,
        {
          provide: getModelToken(Gig.name),
          useValue: {
            find: findMock,
          },
        },
        {
          provide: AiService,
          useValue: {
            lookupGigV1: vi.fn(),
          },
        },
        { provide: CalendarService, useValue: {} },
        { provide: GigPosterService, useValue: { upload: vi.fn() } },
        {
          provide: TelegramService,
          useValue: {
            publishWeeklyDigestToMainChannel:
              publishWeeklyDigestToMainChannelMock,
          },
        },
        { provide: BucketService, useValue: {} },
      ],
    }).compile();

    service = module.get<DigestService>(DigestService);
  });

  it('should be defined when dependencies resolve', () => {
    expect(service).toBeDefined();
  });

  describe('publish', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 5, 10, 12, 0, 0, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should query published gigs within the seven-day inclusive date range for today', async () => {
      const fromMs = new Date(2024, 5, 10, 0, 0, 0, 0).getTime();
      const toMs = new Date(2024, 5, 16, 23, 59, 59, 999).getTime();

      await service.publish();

      expect(findMock).toHaveBeenCalledWith({
        status: Status.Published,
        date: { $gte: fromMs, $lte: toMs },
      });
      expect(collationMock).toHaveBeenCalledWith({
        locale: 'en',
        strength: 2,
      });
      expect(sortMock).toHaveBeenCalledWith({ date: 1, _id: 1 });
    });

    it('should invoke Telegram digest publish with an empty document list when digest date range has no documents', async () => {
      await service.publish();

      expect(publishWeeklyDigestToMainChannelMock).toHaveBeenCalledWith([]);
    });

    it('should invoke Telegram digest publish with loaded documents when digest date range returns documents', async () => {
      const docA = { _id: 'a', publicId: 'gig-a' };
      const docB = { _id: 'b', publicId: 'gig-b' };
      execMock.mockResolvedValue([docA, docB]);

      await service.publish();

      expect(publishWeeklyDigestToMainChannelMock).toHaveBeenCalledWith([
        docA,
        docB,
      ]);
    });
  });
});
