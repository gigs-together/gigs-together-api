import type { InaccessibleMessage, MessageDto } from './message.dto';
import type { TelegramUserDto } from '../../common/dto/user.dto';

export interface CallbackQuery {
  id: string;
  from: TelegramUserDto;
  message?: MessageDto | InaccessibleMessage;
  inline_message_id?: string;
  data?: string;
}
