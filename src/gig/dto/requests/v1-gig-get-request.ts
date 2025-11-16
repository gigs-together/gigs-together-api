import type { GigDto } from '../gig.dto';

export interface V1GigGetRequestQuery {
  page: number;
  size: number;
}

export interface V1GigGetResponseBody {
  gigs: GigDto[];
  isLastPage: boolean;
}
