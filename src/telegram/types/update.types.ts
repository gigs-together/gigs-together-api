import type { TGMessage } from './message.types';
import type { TGCallbackQuery } from './callback-query.types';

export interface TGUpdate {
  update_id: number;
  message?: TGMessage;
  edited_message?: TGMessage;
  callback_query?: TGCallbackQuery;

  [key: string]: unknown;
}
