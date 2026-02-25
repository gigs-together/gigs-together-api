import type { User } from '../../../telegram/types/user.types';

export interface V1ReceiverCreateGigRequestBodyGig {
  title: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  posterFile?: string;
  posterUrl?: string;
}

export interface V1ReceiverCreateGigRequestBodyValidated {
  gig: V1ReceiverCreateGigRequestBodyGig;
  user: User;
}
