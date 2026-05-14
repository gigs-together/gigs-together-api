import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { GigService } from './gig.service';
import { Gig } from './gig.schema';
import { AiService } from '../ai/ai.service';
import { CalendarService } from '../calendar/calendar.service';
import { GigPosterService } from './gig.poster.service';
import { TelegramService } from '../telegram/telegram.service';
import { BucketService } from '../bucket/bucket.service';
import { Status } from './types/status.enum';

describe('GigService', () => {
  let service: GigService;

  const execMock = vi.fn();
  const sortMock = vi.fn().mockReturnValue({ exec: execMock });
  const collationMock = vi.fn().mockReturnValue({ sort: sortMock });
  const findMock = vi.fn().mockReturnValue({ collation: collationMock });

  beforeEach(async () => {
    vi.clearAllMocks();
    execMock.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
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
        { provide: TelegramService, useValue: {} },
        { provide: BucketService, useValue: {} },
      ],
    }).compile();

    service = module.get<GigService>(GigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPublishedGigDocumentsInInclusiveMsRange', () => {
    it('should query published gigs with inclusive date bounds when fromMs and toMs are given', async () => {
      const fromMs = new Date(2024, 5, 10, 0, 0, 0, 0).getTime();
      const toMs = new Date(2024, 5, 16, 23, 59, 59, 999).getTime();

      await service.getPublishedGigDocumentsInInclusiveMsRange({
        fromMs,
        toMs,
      });

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
  });
});
