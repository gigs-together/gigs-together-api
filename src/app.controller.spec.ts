import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import type { AppHealthResponse } from './app.types';

describe('AppController', () => {
  let appController: AppController;
  const healthResponse: AppHealthResponse = {
    ok: true,
    service: 'gigs-together-api',
    checks: {
      mongodb: {
        ok: true,
      },
    },
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getRoot: () => ({ ok: true, service: 'gigs-together-api' }),
            getHealth: async () => healthResponse,
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return api info', () => {
      const res = appController.getRoot();
      expect(res).toEqual({ ok: true, service: 'gigs-together-api' });
    });
  });

  describe('health', () => {
    it('should return health status', async () => {
      await expect(appController.getHealth()).resolves.toEqual(healthResponse);
    });
  });
});
