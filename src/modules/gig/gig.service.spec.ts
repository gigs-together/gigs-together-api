import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { GigService } from './gig.service';
import { getModelToken } from '@nestjs/mongoose';
import { Gig } from './gig.schema';
import { AiService } from '../ai/ai.service';

describe('GigService', () => {
  let service: GigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigService,
        {
          provide: getModelToken(Gig.name),
          useValue: {},
        },
        {
          provide: AiService,
          useValue: {
            lookupGigV1: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GigService>(GigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
