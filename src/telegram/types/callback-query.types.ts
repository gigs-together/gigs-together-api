import type { TGInaccessibleMessage, TGMessage } from './message.types';
import type { TGUser } from './user.types';

export interface TGCallbackQuery {
  id: string;
  from: TGUser;
  message?: TGMessage | TGInaccessibleMessage;
  inline_message_id?: string;
  data?: string;
}
