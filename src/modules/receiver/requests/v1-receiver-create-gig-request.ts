import type { User } from '../../telegram/types/user.types';

interface CreateGigDto {
  title: string;
  date: string;
  location: string;
  ticketsUrl: string;
  photo?: string;
}

export interface V1ReceiverCreateGigRequestBody {
  gig: CreateGigDto;
  telegramInitDataString: string;
}

export interface V1ReceiverCreateGigRequestBodyValidated {
  gig: CreateGigDto;
  user: User;
}
