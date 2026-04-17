import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import type { AppHealthResponse } from '../src/app.types';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  const healthResponse: AppHealthResponse = {
    ok: true,
    service: 'gigs-together-api',
    checks: {
      mongodb: {
        ok: true,
      },
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
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

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('/ (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'gigs-together-api' });
  });

  it('/health (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(healthResponse);
  });
});
