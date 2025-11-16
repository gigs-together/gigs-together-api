import type { MessageDto } from './message.dto';

export interface UpdateDto {
  update_id: number;
  message?: MessageDto;
  edited_message?: MessageDto;

  [key: string]: unknown;
}
