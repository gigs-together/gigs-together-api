import type { TelegramUserDto } from '../../common/dto/user.dto';
import type { ChatDto } from './chat.dto';

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

  [key: string]: unknown;
}

export interface InaccessibleMessage {
  chat: ChatDto;
  message_id: number;
  date: 0; // Always 0. The field can be used to differentiate regular and inaccessible messages.
}
