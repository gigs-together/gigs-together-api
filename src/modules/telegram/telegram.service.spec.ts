import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TelegramService } from './telegram.service';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import type { TGMessage } from './types/message.types';

describe('TelegramService', () => {
  let service: TelegramService;

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.APP_API_BASE_URL;
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

  describe('toAbsolutePublicUrlForTelegram (private)', () => {
    it('should keep absolute http(s) URL unchanged', () => {
      const fn = (
        service as unknown as {
          toAbsolutePublicUrlForTelegram: (value: string) => string;
        }
      ).toAbsolutePublicUrlForTelegram.bind(service);
      expect(fn('https://example.com/a.png')).toBe('https://example.com/a.png');
      expect(fn('http://example.com/a.png')).toBe('http://example.com/a.png');
    });

    it('should trim whitespace', () => {
      const fn = (
        service as unknown as {
          toAbsolutePublicUrlForTelegram: (value: string) => string;
        }
      ).toAbsolutePublicUrlForTelegram.bind(service);
      expect(fn(' https://example.com/a.png ')).toBe(
        'https://example.com/a.png',
      );
    });

    it('should resolve "/public/..." against base origin (ignoring base path)', () => {
      process.env.APP_API_BASE_URL = 'https://example.com/api';
      const fn = (
        service as unknown as {
          toAbsolutePublicUrlForTelegram: (value: string) => string;
        }
      ).toAbsolutePublicUrlForTelegram.bind(service);
      expect(fn('/public/files-proxy/gigs/a%20b.jpg')).toBe(
        'https://example.com/public/files-proxy/gigs/a%20b.jpg',
      );
    });

    it('should throw when base is missing for relative URLs', () => {
      const fn = (
        service as unknown as {
          toAbsolutePublicUrlForTelegram: (value: string) => string;
        }
      ).toAbsolutePublicUrlForTelegram.bind(service);
      expect(() => fn('/public/files-proxy/gigs/x.jpg')).toThrow(
        /set APP_API_BASE_URL/i,
      );
    });
  });
});
