import type { Types } from 'mongoose';

export type GigId = string | Types.ObjectId;

export interface GigDto {
  title: string;
  date: string;
  location: string;
  ticketsUrl: string;
  photo?: string;
}

export interface SubmitGig {
  gig: GigDto;
  isAdmin: boolean;
}

export interface GetGigs {
  page: number;
  size: number;
}
