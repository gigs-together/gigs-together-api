import type { Types } from 'mongoose';
import type { Status } from './status.enum';
import type { TGUser } from '../../telegram/types/user.types';
import type { TGMessage } from '../../telegram/types/message.types';

export type GigId = string | Types.ObjectId;

export interface V1GetGigsResponseBodyGig {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  calendarUrl: string;
  posterUrl?: string;
  postUrl?: string;
}

export interface CreateGigInput {
  title: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  poster?: {
    bucketPath?: string;
    externalUrl?: string;
  };
  suggestedBy: GigSuggestedBy;
}

export interface GetGigs {
  page: number;
  size: number;
  /**
   * Range bounds for `Gig.date` (ms since epoch), inclusive.
   */
  from: number;
  to?: number;
  status?: Status;
  /**
   * Exact match location filter.
   * Applied only when both `city` and `country` are provided.
   */
  city?: string;
  /**
   * ISO 3166-1 alpha-2 code (uppercase), e.g. "ES", "US".
   */
  country?: string;
}

export interface GigSuggestedBy {
  userId: TGUser['id'];
  feedbackMessageId?: TGMessage['message_id'];
}
