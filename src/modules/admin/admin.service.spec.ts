import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { GigService } from '../gig/gig.service';
import { Status } from '../gig/types/status.enum';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;

  const gigServiceMock = {
    getGigCountByStatus: vi.fn(),
  };

  beforeEach(async () => {
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

      expect(gigServiceMock.getGigCountByStatus).toHaveBeenCalledWith(
        Status.Pending,
      );
      expect(gigServiceMock.getGigCountByStatus).toHaveBeenCalledWith(
        Status.Published,
      );
    });
  });
});
