import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';

import { GigService } from '../gig/gig.service';
import { Status } from '../gig/types/status.enum';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;

  const gigServiceMock = {
    getGigCountByStatus: vi.fn(),
    getGigsByStatus: vi.fn(),
    resolveGigPosterPublicUrl: vi.fn(),
    resolvePublishedPostUrl: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    gigServiceMock.getGigCountByStatus.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: GigService,
          useValue: gigServiceMock,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboard', () => {
    it('should map gig status counts into dashboard summary', async () => {
      gigServiceMock.getGigCountByStatus.mockImplementation(
        (status: Status) => {
          if (status === Status.Pending) {
            return Promise.resolve(3);
          }
          if (status === Status.Published) {
            return Promise.resolve(12);
          }
          return Promise.resolve(0);
        },
      );

      await expect(service.getDashboard()).resolves.toEqual({
        summary: {
          pendingGigsCount: 3,
          publishedGigsCount: 12,
        },
      });
    });
  });

  describe('getGigsList', () => {
    it('should return mapped gigs for pending status query', async () => {
      const gigId = new Types.ObjectId();
      const gigDoc = {
        _id: gigId,
        publicId: 'my-gig',
        title: 'My Gig',
        date: new Date('2026-06-12T12:00:00.000Z').getTime(),
        city: 'barcelona',
        country: 'ES',
        venue: 'Venue',
        ticketsUrl: '',
        status: Status.Pending,
        posts: [],
        suggestedBy: { userId: 42 },
      };

      gigServiceMock.getGigsByStatus.mockResolvedValue([gigDoc]);
      gigServiceMock.resolveGigPosterPublicUrl.mockReturnValue(undefined);
      gigServiceMock.resolvePublishedPostUrl.mockResolvedValue(undefined);

      await expect(
        service.getGigsList({ status: 'pending', limit: 50 }),
      ).resolves.toEqual({
        gigs: [
          expect.objectContaining({
            id: String(gigId),
            publicId: 'my-gig',
            status: Status.Pending,
            date: '2026-06-12',
            suggestedBy: { userId: '42' },
          }),
        ],
      });

      expect(gigServiceMock.getGigsByStatus).toHaveBeenCalledWith({
        status: Status.Pending,
        limit: 50,
      });
    });
  });
});
