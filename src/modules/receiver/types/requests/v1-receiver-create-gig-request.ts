import type { User } from '../../../telegram/types/user.types';

export interface V1ReceiverCreateGigRequestBodyGig {
  title: string;
  date: string;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  posterFile?: string;
  posterUrl?: string;
}

export interface V1ReceiverCreateGigRequestBody {
  // When using multipart/form-data, nested objects are typically sent as JSON strings.
  gig: V1ReceiverCreateGigRequestBodyGig | string;
  telegramInitDataString: string;
}

export interface V1ReceiverCreateGigRequestBodyValidated {
  gig: V1ReceiverCreateGigRequestBodyGig;
  user: User;
}
