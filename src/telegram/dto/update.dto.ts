import type { MessageDto } from './message.dto';
import type { CallbackQuery } from './callback-query.dto';

export interface UpdateDto {
  update_id: number;
  message?: MessageDto;
  edited_message?: MessageDto;
  callback_query?: CallbackQuery;

  [key: string]: unknown;
}
