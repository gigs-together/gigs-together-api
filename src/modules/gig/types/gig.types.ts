import type { Types } from 'mongoose';
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
  publicId: string;
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

export interface GigSuggestedBy {
  userId: TGUser['id'];
  feedbackMessageId?: TGMessage['message_id'];
}

/**
 * Shape used to prefill gig edit form in the mini-app.
 */
export interface GigFormDataByPublicId {
  publicId: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  posterUrl?: string;
}
