import { TelegramUserDto } from '../../common/dto/user.dto';
import { ChatDto } from './chat.dto';

export type ChatId = string | number;

export interface MessageDto {
  message_id: number;
  from?: TelegramUserDto;
  chat: ChatDto;
  text?: string; // UTF-8 text
  date: number;
  reply_to_message?: MessageDto;

  [key: string]: unknown;
}

export interface SendMessageDto {
  chatId: ChatId;
  text: string;
}
