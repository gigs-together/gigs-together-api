import { Controller, Get, Query, Version } from '@nestjs/common';
import { GigService } from './gig.service';
import {
  V1GigGetRequestQuery,
  V1GigGetResponseBody,
} from './types/requests/v1-gig-get-request';

@Controller('gig')
export class GigController {
  constructor(private readonly gigService: GigService) {}

  @Version('1')
  @Get()
  async getGigsV1(
    @Query() query: V1GigGetRequestQuery,
  ): Promise<V1GigGetResponseBody> {
    const { page = 1, size = 10 } = query;

    const gigs = await this.gigService.getGigs({ page, size });

    return {
      gigs: gigs.map((gig) => ({
        title: gig.title,
        date: gig.date.toString(), // TODO
        location: gig.location,
        ticketsUrl: gig.ticketsUrl,
        status: gig.status,
      })),
      // TODO
      isLastPage: true,
    };
  }
}
