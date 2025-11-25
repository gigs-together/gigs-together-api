import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { getModelToken } from '@nestjs/mongoose';
import type { AdminDocument } from '../../shared/schemas/admin.schema';
import { Admin } from '../../shared/schemas/admin.schema';
import type { Model } from 'mongoose';

describe('AuthService', () => {
  let service: AuthService;
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
        AuthService,
        {
          provide: getModelToken(Admin.name), // Mock the Admin model
          useValue: adminModelMock,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    adminModel = module.get<Model<AdminDocument>>(getModelToken(Admin.name));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('pullAdmins', () => {
    it('should fetch admins and update the cache', async () => {
      // Call the private method indirectly
      await service['pullAdmins']();

      // Verify the database query
      expect(adminModel.find).toHaveBeenCalledWith({ isActive: true });

      // Check that the cache was updated
      expect(service['adminsCache']).toEqual(mockAdmins);
    });
  });

  describe('isAdmin', () => {
    it('should return true if telegramId exists in the cache', async () => {
      // Populate the cache first
      await service['pullAdmins']();

      const result = await service.isAdmin(123);
      expect(result).toBe(true);
    });

    it('should return false if telegramId does not exist in the cache', async () => {
      // Populate the cache first
      await service['pullAdmins']();

      const result = await service.isAdmin(999);
      expect(result).toBe(false);
    });

    it('should call pullAdmins if cache is empty', async () => {
      // Spy on pullAdmins to ensure it's called
      const pullAdminsSpy = jest.spyOn(service as any, 'pullAdmins');

      const result = await service.isAdmin(123);
      expect(pullAdminsSpy).toHaveBeenCalled();
      expect(result).toBe(true); // Should still work after cache is populated
    });
  });
});
