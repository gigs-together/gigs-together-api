import type { TGChat } from './chat.types';
import type { TGUser } from './user.types';

export type TGChatId = string | number;

export interface TGMessage {
  message_id: number;
  from?: TGUser;
  chat: TGChat;
  text?: string; // UTF-8 text
  date: number;
  reply_to_message?: TGMessage;

  [key: string]: unknown;
}

export interface TGSendMessage {
  chat_id: TGChatId;
  text: string;

  [key: string]: unknown;
}

export interface SendMessage {
  chatId: TGChatId;
  text: string;

  [key: string]: unknown;
}

export interface TGInaccessibleMessage {
  chat: TGChat;
  message_id: number;
  date: 0; // Always 0. The field can be used to differentiate regular and inaccessible messages.
}
