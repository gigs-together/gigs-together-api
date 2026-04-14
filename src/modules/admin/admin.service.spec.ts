import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Admin } from '../../shared/schemas/admin.schema';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;

  const mockAdmins = [
    { telegramId: 123, isActive: true },
    { telegramId: 456, isActive: true },
  ];

  const adminModelMock = {
    find: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockAdmins),
    }),
  };

  const configServiceMock = {
    get: vi.fn().mockReturnValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getModelToken(Admin.name),
          useValue: adminModelMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isAdmin', () => {
    it('loads admins from DB on first call', async () => {
      await service.isAdmin(123);
      expect(adminModelMock.find).toHaveBeenCalledWith({ isActive: true });
    });

    it('should return true if telegramId exists in the cache', async () => {
      await service.refreshAdminsCache();
      const result = await service.isAdmin(123);
      expect(result).toBe(true);
    });

    it('should return false if telegramId does not exist in the cache', async () => {
      await service.refreshAdminsCache();
      const result = await service.isAdmin(999);
      expect(result).toBe(false);
    });
  });

  describe('cache TTL', () => {
    let dateNowSpy: ReturnType<typeof vi.spyOn>;
    let virtualNow: number;

    beforeEach(() => {
      virtualNow = 1_000_000;
      dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => virtualNow);
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
    });

    it('does not reload within TTL', async () => {
      await service.isAdmin(123);
      expect(adminModelMock.find).toHaveBeenCalledTimes(1);

      virtualNow += 3_600_000 - 1; // default TTL is 1 hour (3_600_000 ms)
      await service.isAdmin(123);
      expect(adminModelMock.find).toHaveBeenCalledTimes(1);

      virtualNow += 1;
      await service.isAdmin(123);
      expect(adminModelMock.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshAdminsCache', () => {
    it('reloads from DB even when TTL has not elapsed', async () => {
      await service.isAdmin(123);
      expect(adminModelMock.find).toHaveBeenCalledTimes(1);
      await service.refreshAdminsCache();
      expect(adminModelMock.find).toHaveBeenCalledTimes(2);
    });
  });
});
