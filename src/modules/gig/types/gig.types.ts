import type { Types } from 'mongoose';
import type { Status } from './status.enum';

export type GigId = string | Types.ObjectId;

export interface GigDto {
  title: string;
  date: string;
  location: string;
  ticketsUrl: string;
  photo?: { tgFileId?: string; url?: string };
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
