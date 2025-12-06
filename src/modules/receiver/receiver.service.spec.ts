import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ReceiverService } from './receiver.service';
import { TelegramService } from '../telegram/telegram.service';
import { GigService } from '../gig/gig.service';
import type { TGMessage } from '../telegram/types/message.types';

describe('ReceiverService', () => {
  let service: ReceiverService;
  let telegramService: TelegramService;
  let gigService: GigService;

  const mockTelegramService = {
    sendMessage: jest.fn(),
    answerCallbackQuery: jest.fn(),
    editMessageReplyMarkup: jest.fn(),
    publishDraft: jest.fn(),
    publishMain: jest.fn(),
  };

  const mockGigService = {
    saveGig: jest.fn(),
    updateGig: jest.fn(),
    updateGigStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiverService,
        {
          provide: TelegramService,
          useValue: mockTelegramService,
        },
        {
          provide: GigService,
          useValue: mockGigService,
        },
      ],
    }).compile();

    service = module.get<ReceiverService>(ReceiverService);
    telegramService = module.get<TelegramService>(TelegramService);
    gigService = module.get<GigService>(GigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleMessage', () => {
    it('should respond to a non-command message', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        text: 'Hello!',
        chat: { id: 12345, type: 'private' },
      };

      mockTelegramService.sendMessage.mockResolvedValue(undefined);

      await service.handleMessage(message);

      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith({
        chat_id: 12345,
        text: `You said: "Hello!"`,
      });
    });

    it('should handle the /start command', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        text: '/start',
        chat: { id: 12345, type: 'private' },
      };

      mockTelegramService.sendMessage.mockResolvedValue(undefined);

      await service.handleMessage(message);

      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith({
        chat_id: 12345,
        text: `Hi! I'm a Gigs Together bot. I am still in development...`,
      });
    });

    it('should handle an unknown command', async () => {
      const message: TGMessage = {
        message_id: 123,
        date: Date.now(),
        text: '/unknown',
        chat: { id: 12345, type: 'private' },
      };

      mockTelegramService.sendMessage.mockResolvedValue(undefined);

      await service.handleMessage(message);

      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith({
        chat_id: 12345,
        text: `Hey there, I don't know that command.`,
      });
    });

    it('should ignore empty messages', async () => {
      await service.handleMessage(null as any);
      await service.handleMessage({} as TGMessage);

      expect(mockTelegramService.sendMessage).not.toHaveBeenCalled();
    });
  });
});
