import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ReceiverService } from './modules/receiver/receiver.service';

describe('AppController', () => {
  let appController: AppController;
  const receiverServiceMock: Pick<ReceiverService, 'listGigPhotos'> = {
    listGigPhotos: async () => ['https://example.com/a.jpg'],
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: ReceiverService, useValue: receiverServiceMock },
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

  describe('photos', () => {
    it('should return photos list', async () => {
      const res = await appController.getPhotos();
      expect(res).toEqual({ photos: ['https://example.com/a.jpg'] });
    });
  });
});
