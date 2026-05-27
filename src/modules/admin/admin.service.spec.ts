import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboard', () => {
    it('should return zeroed dashboard summary until metrics are implemented', () => {
      expect(service.getDashboard()).toEqual({
        summary: {
          pendingGigsCount: 0,
          publishedGigsCount: 0,
        },
      });
    });
  });
});
