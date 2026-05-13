import { HttpService } from '@nestjs/axios';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import type { TGMessage } from './types/message.types';
import { TGInputMediaType } from './types/message.types';
import {
  TelegramBotClient,
  TELEGRAM_CALLBACK_QUERY_NOTIFICATION_MAX_CHARS,
} from './telegram-bot.client';

describe('TelegramBotClient', () => {
  let client: TelegramBotClient;

  const mockHttpService = {
    post: vi.fn(),
    get: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramBotClient,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    client = module.get<TelegramBotClient>(TelegramBotClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
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

      const result = await client.sendMessage({ chat_id, text });

      expect(mockHttpService.post).toHaveBeenCalledWith('sendMessage', {
        chat_id,
        text,
      });
      expect(result).toEqual(mockMessage);
    });
  });

  describe('sendPhoto', () => {
    it('should throw RangeError when photo string is empty', async () => {
      await expect(
        client.sendPhoto({
          chat_id: 1,
          photo: '   ',
          caption: 'ok',
        }),
      ).rejects.toThrow(RangeError);
      await expect(
        client.sendPhoto({
          chat_id: 1,
          photo: '   ',
          caption: 'ok',
        }),
      ).rejects.toThrow(/non-empty/);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('sendMediaGroup', () => {
    it('should throw RangeError when media item count is outside Telegram Bot API limits', async () => {
      await expect(
        client.sendMediaGroup({
          chat_id: 1,
          media: [
            {
              type: TGInputMediaType.Photo,
              media: 'https://cdn.example/a.jpg',
            },
          ],
        }),
      ).rejects.toThrow(RangeError);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should send the correct HTTP request', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            result: [
              {
                message_id: 1,
                date: 1,
                chat: { id: -1001, type: 'channel' },
              },
            ],
          },
        }),
      );

      await client.sendMediaGroup({
        chat_id: 1,
        media: [
          {
            type: TGInputMediaType.Photo,
            media: 'https://cdn.example/a.jpg',
          },
          {
            type: TGInputMediaType.Photo,
            media: 'https://cdn.example/b.jpg',
          },
        ],
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'sendMediaGroup',
        expect.objectContaining({
          chat_id: 1,
          media: expect.any(Array),
        }),
      );
    });
  });

  describe('answerCallbackQuery', () => {
    it('should throw RangeError when notification text exceeds Telegram Bot API limit', async () => {
      const text = 'x'.repeat(
        TELEGRAM_CALLBACK_QUERY_NOTIFICATION_MAX_CHARS + 1,
      );

      await expect(
        client.answerCallbackQuery({
          callback_query_id: 'cq1',
          text,
          show_alert: false,
        }),
      ).rejects.toThrow(RangeError);
      await expect(
        client.answerCallbackQuery({
          callback_query_id: 'cq1',
          text,
          show_alert: false,
        }),
      ).rejects.toThrow(/answerCallbackQuery text/);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });
});
