import { AdminController } from './admin.controller';
import type { AdminService } from './admin.service';
import type { LanguageService } from '../language/language.service';

describe('AdminController', () => {
  const adminService = {
    getDashboard: vi.fn().mockResolvedValue({
      summary: {
        pendingGigsCount: 3,
        publishedGigsCount: 12,
      },
    }),
  } satisfies Pick<AdminService, 'getDashboard'>;

  const languageService = {
    getAllLanguagesOrdered: vi
      .fn()
      .mockResolvedValue([
        { iso: 'en', name: 'English', isActive: true, order: 0 },
      ]),
    updateLanguageByIso: vi.fn().mockResolvedValue({
      iso: 'en',
      name: 'English',
      isActive: false,
      order: 0,
    }),
  } satisfies Pick<
    LanguageService,
    'getAllLanguagesOrdered' | 'updateLanguageByIso'
  >;

  const authorizationService = {
    refreshAdminsCache: vi.fn(),
  };

  const configService = {
    get: vi.fn().mockReturnValue('secret'),
  };

  const controller = new AdminController(
    adminService as unknown as AdminService,
    authorizationService as never,
    configService as never,
    languageService as unknown as LanguageService,
  );

  describe('getDashboard', () => {
    it('should return dashboard summary counts from admin service', async () => {
      await expect(controller.getDashboard()).resolves.toEqual({
        summary: {
          pendingGigsCount: 3,
          publishedGigsCount: 12,
        },
      });
    });
  });

  describe('getLanguages', () => {
    it('should return languages from language service', async () => {
      await expect(controller.getLanguages()).resolves.toEqual([
        { iso: 'en', name: 'English', isActive: true, order: 0 },
      ]);
      expect(languageService.getAllLanguagesOrdered).toHaveBeenCalled();
    });
  });

  describe('patchLanguage', () => {
    it('should update language via language service', async () => {
      await expect(
        controller.patchLanguage('en', { isActive: false }),
      ).resolves.toEqual({
        iso: 'en',
        name: 'English',
        isActive: false,
        order: 0,
      });

      expect(languageService.updateLanguageByIso).toHaveBeenCalledWith({
        iso: 'en',
        isActive: false,
      });
    });
  });
});
