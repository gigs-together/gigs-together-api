import type { Types } from 'mongoose';
import type { Status } from './status.enum';

export type GigId = string | Types.ObjectId;

export interface V1GetGigsResponseBodyGig {
  title: string;
  date: string;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  posterUrl?: string;
}

export interface CreateGigInput {
  title: string;
  date: string;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  poster?: {
    bucketPath?: string;
    externalUrl?: string;
    tgFileId?: string;
  };
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
}
