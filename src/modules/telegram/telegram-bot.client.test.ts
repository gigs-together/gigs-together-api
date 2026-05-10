import { HttpService } from '@nestjs/axios';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import type { TGMessage } from './types/message.types';
import { TGInputMediaType } from './types/message.types';
import {
  TelegramBotClient,
  TELEGRAM_MEDIA_CAPTION_MAX_CHARS,
  TELEGRAM_SEND_MESSAGE_TEXT_MAX_CHARS,
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

    it('should throw RangeError when text exceeds Telegram Bot API limit', async () => {
      const text = 'x'.repeat(TELEGRAM_SEND_MESSAGE_TEXT_MAX_CHARS + 1);

      await expect(client.sendMessage({ chat_id: 1, text })).rejects.toThrow(
        RangeError,
      );
      await expect(client.sendMessage({ chat_id: 1, text })).rejects.toThrow(
        /sendMessage text/,
      );
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('sendPhoto', () => {
    it('should throw RangeError when caption exceeds Telegram Bot API limit', async () => {
      const caption = 'x'.repeat(TELEGRAM_MEDIA_CAPTION_MAX_CHARS + 1);

      await expect(
        client.sendPhoto({
          chat_id: 1,
          photo: 'https://cdn.example/a.jpg',
          caption,
        }),
      ).rejects.toThrow(RangeError);
      await expect(
        client.sendPhoto({
          chat_id: 1,
          photo: 'https://cdn.example/a.jpg',
          caption,
        }),
      ).rejects.toThrow(/sendPhoto caption/);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

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
    it('should throw RangeError when a media item caption exceeds Telegram Bot API limit', async () => {
      const caption = 'x'.repeat(TELEGRAM_MEDIA_CAPTION_MAX_CHARS + 1);

      await expect(
        client.sendMediaGroup({
          chat_id: 1,
          media: [
            {
              type: TGInputMediaType.Photo,
              media: 'https://cdn.example/a.jpg',
              caption,
            },
            {
              type: TGInputMediaType.Photo,
              media: 'https://cdn.example/b.jpg',
            },
          ],
        }),
      ).rejects.toThrow(RangeError);
      await expect(
        client.sendMediaGroup({
          chat_id: 1,
          media: [
            {
              type: TGInputMediaType.Photo,
              media: 'https://cdn.example/a.jpg',
              caption,
            },
            {
              type: TGInputMediaType.Photo,
              media: 'https://cdn.example/b.jpg',
            },
          ],
        }),
      ).rejects.toThrow(/sendMediaGroup media\[0\] caption/);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('editMessageText', () => {
    it('should throw RangeError when text exceeds Telegram Bot API limit', async () => {
      const text = 'x'.repeat(TELEGRAM_SEND_MESSAGE_TEXT_MAX_CHARS + 1);

      await expect(
        client.editMessageText({
          chatId: 1,
          messageId: 2,
          text,
        }),
      ).rejects.toThrow(RangeError);
      await expect(
        client.editMessageText({
          chatId: 1,
          messageId: 2,
          text,
        }),
      ).rejects.toThrow(/editMessageText text/);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('editMessageCaption', () => {
    it('should throw RangeError when caption exceeds Telegram Bot API limit', async () => {
      const caption = 'x'.repeat(TELEGRAM_MEDIA_CAPTION_MAX_CHARS + 1);

      await expect(
        client.editMessageCaption({
          chatId: 1,
          messageId: 2,
          caption,
        }),
      ).rejects.toThrow(RangeError);
      await expect(
        client.editMessageCaption({
          chatId: 1,
          messageId: 2,
          caption,
        }),
      ).rejects.toThrow(/editMessageCaption caption/);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('editMessageMedia', () => {
    it('should throw RangeError when media caption exceeds Telegram Bot API limit', async () => {
      const caption = 'x'.repeat(TELEGRAM_MEDIA_CAPTION_MAX_CHARS + 1);

      await expect(
        client.editMessageMedia({
          chatId: 1,
          messageId: 2,
          media: {
            type: TGInputMediaType.Photo,
            media: 'https://cdn.example/a.jpg',
            caption,
          },
        }),
      ).rejects.toThrow(RangeError);
      await expect(
        client.editMessageMedia({
          chatId: 1,
          messageId: 2,
          media: {
            type: TGInputMediaType.Photo,
            media: 'https://cdn.example/a.jpg',
            caption,
          },
        }),
      ).rejects.toThrow(/editMessageMedia media\.caption/);
      expect(mockHttpService.post).not.toHaveBeenCalled();
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
