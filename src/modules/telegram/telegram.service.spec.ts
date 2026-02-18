import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TelegramService } from './telegram.service';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { of } from 'rxjs';
import type { TGMessage } from './types/message.types';
import { BucketService } from '../bucket/bucket.service';

describe('TelegramService', () => {
  let service: TelegramService;

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    reset: jest.fn(),
  };

  const mockBucketService = {
    getPublicPosterUrl: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: BucketService,
          useValue: mockBucketService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCache,
        },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.S3_PUBLIC_BASE_URL;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMessage', () => {
    it('should send the correct HTTP request', async () => {
      const chat_id = 12345;
      const text = 'Hello, World!';
      const mockMessage: TGMessage = {
        message_id: 1,
        date: Date.now(),
        chat: { id: chat_id, type: 'private' },
        text,
      };

      mockHttpService.post.mockReturnValue(
        of({
          data: {
            result: mockMessage,
          },
        }),
      );

      const result = await service.sendMessage({ chat_id, text });

      expect(mockHttpService.post).toHaveBeenCalledWith('sendMessage', {
        chat_id,
        text,
      });
      expect(result).toEqual(mockMessage);
    });
  });
});
