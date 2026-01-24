import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BucketService } from './modules/bucket/bucket.service';
import { GigService } from './modules/gig/gig.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const bucketServiceMock: Pick<
      BucketService,
      | 'getPresignedGigPosterUrlByKey'
      | 'tryGetGigPosterObjectByKey'
      | 'readS3BodyToBuffer'
    > = {
      getPresignedGigPosterUrlByKey: jest.fn(),
      tryGetGigPosterObjectByKey: jest.fn(),
      readS3BodyToBuffer: jest.fn(),
    };

    const gigServiceMock: Pick<GigService, 'findByStoredPosterKey'> = {
      findByStoredPosterKey: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: BucketService, useValue: bucketServiceMock },
        { provide: GigService, useValue: gigServiceMock },
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
});
