import { AdminController } from './admin.controller';
import type { AdminService } from './admin.service';

describe('AdminController', () => {
  const adminService = {
    getDashboard: vi.fn().mockReturnValue({
      summary: {
        pendingGigsCount: 0,
        publishedGigsCount: 0,
      },
    }),
  } satisfies Pick<AdminService, 'getDashboard'>;

  const authorizationService = {
    refreshAdminsCache: vi.fn(),
  };

  const configService = {
    get: vi.fn().mockReturnValue('secret'),
  };

  const controller = new AdminController(
    adminService as AdminService,
    authorizationService as never,
    configService as never,
  );

  describe('getDashboard', () => {
    it('should return placeholder summary counts', () => {
      expect(controller.getDashboard()).toEqual({
        summary: {
          pendingGigsCount: 0,
          publishedGigsCount: 0,
        },
      });
    });
  });
});
