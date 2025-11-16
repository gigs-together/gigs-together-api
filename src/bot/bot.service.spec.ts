import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BotService } from './bot.service';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import type { MessageDto } from './dto/message.dto';

describe('BotService', () => {
  let service: BotService;

  const mockHttpService = {
    get: jest.fn(), // Mock the `get` method of `HttpService`
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotService,
        {
          provide: HttpService,
          useValue: mockHttpService, // Provide the mocked HttpService
        },
      ],
    }).compile();

    service = module.get<BotService>(BotService);
  });

  afterEach(() => {
    jest.clearAllMocks(); // Clear mocks after each test
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMessage', () => {
    it('should send the correct HTTP request', async () => {
      const chatId = 12345;
      const text = 'Hello, World!';

      mockHttpService.get.mockReturnValue(of({})); // Mock a successful response

      await service.sendMessage({ chatId, text });

      expect(mockHttpService.get).toHaveBeenCalledWith('sendMessage', {
        params: { chat_id: chatId, text },
      });
    });
  });

  describe('handleMessage', () => {
    it('should respond to a non-command message', async () => {
      const message: MessageDto = {
        message_id: 123,
        date: Date.now(),
        text: 'Hello!',
        chat: { id: 12345, type: 'private' },
      };

      const sendMessageSpy = jest
        .spyOn(service, 'sendMessage')
        .mockResolvedValue();

      await service.handleMessage(message);

      expect(sendMessageSpy).toHaveBeenCalledWith({
        chatId: 12345,
        text: `You said: "Hello!"`,
      });
    });

    it('should handle the /start command', async () => {
      const message: MessageDto = {
        message_id: 123,
        date: Date.now(),
        text: '/start',
        chat: { id: 12345, type: 'private' },
      };

      const sendMessageSpy = jest
        .spyOn(service, 'sendMessage')
        .mockResolvedValue();

      await service.handleMessage(message);

      expect(sendMessageSpy).toHaveBeenCalledWith({
        chatId: 12345,
        text: `Hi! I'm a Gigs Together bot. I am still in development...`,
      });
    });

    it('should handle an unknown command', async () => {
      const message: MessageDto = {
        message_id: 123,
        date: Date.now(),
        text: '/unknown',
        chat: { id: 12345, type: 'private' },
      };

      const sendMessageSpy = jest
        .spyOn(service, 'sendMessage')
        .mockResolvedValue();

      await service.handleMessage(message);

      expect(sendMessageSpy).toHaveBeenCalledWith({
        chatId: 12345,
        text: `Hey there, I don't know that command.`,
      });
    });

    it('should ignore empty messages', async () => {
      const sendMessageSpy = jest
        .spyOn(service, 'sendMessage')
        .mockResolvedValue();

      await service.handleMessage(null); // Simulate a null message
      await service.handleMessage({} as MessageDto); // Simulate an invalid message

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });
  });
});
