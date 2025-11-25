import type { User } from '../user.types';

interface CreateGigDto {
  title: string;
  date: string;
  location: string;
  ticketsUrl: string;
  photo?: string;
}

export interface V1TelegramCreateGigRequestBody {
  gig: CreateGigDto;
  telegramInitDataString: string;
}

export interface V1TelegramCreateGigRequestBodyValidated {
  gig: CreateGigDto;
  user: User;
}
