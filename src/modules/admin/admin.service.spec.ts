import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import type { AdminDocument } from '../../shared/schemas/admin.schema';
import { Admin } from '../../shared/schemas/admin.schema';
import type { Model } from 'mongoose';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let adminModel: Model<AdminDocument>;

  const mockAdmins = [
    { telegramId: 123, isActive: true },
    { telegramId: 456, isActive: true },
  ];

  const adminModelMock = {
    find: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockAdmins),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getModelToken(Admin.name),
          useValue: adminModelMock,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    adminModel = module.get<Model<AdminDocument>>(getModelToken(Admin.name));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('pullAdmins', () => {
    it('should fetch admins and update the cache', async () => {
      await (
        service as unknown as {
          pullAdmins: () => Promise<void>;
          adminsCache: AdminDocument[];
        }
      ).pullAdmins();

      expect(adminModel.find).toHaveBeenCalledWith({ isActive: true });

      expect(
        (service as unknown as { adminsCache: AdminDocument[] }).adminsCache,
      ).toEqual(mockAdmins);
    });
  });

  describe('isAdmin', () => {
    it('should return true if telegramId exists in the cache', async () => {
      await (
        service as unknown as { pullAdmins: () => Promise<void> }
      ).pullAdmins();

      const result = await service.isAdmin(123);
      expect(result).toBe(true);
    });

    it('should return false if telegramId does not exist in the cache', async () => {
      await (
        service as unknown as { pullAdmins: () => Promise<void> }
      ).pullAdmins();

      const result = await service.isAdmin(999);
      expect(result).toBe(false);
    });

    it('should call pullAdmins if cache is empty', async () => {
      const pullAdminsSpy = jest.spyOn(
        service as unknown as { pullAdmins: () => Promise<void> },
        'pullAdmins',
      );

      const result = await service.isAdmin(123);
      expect(pullAdminsSpy).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });
});
