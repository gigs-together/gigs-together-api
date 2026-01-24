import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { BucketService } from '../src/modules/bucket/bucket.service';
import { GigService } from '../src/modules/gig/gig.service';

describe('AppController (e2e)', () => {
  let app: INestApplication;

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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: BucketService, useValue: bucketServiceMock },
        { provide: GigService, useValue: gigServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ ok: true, service: 'gigs-together-api' });
  });
});
