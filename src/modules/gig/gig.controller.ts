import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Version,
} from '@nestjs/common';
import { GigService } from './gig.service';
import { V1GigGetRequestQuery } from './types/requests/v1-gig-get-request';
import type { V1GetGigsResponseBody } from './types/requests/v1-gig-get-request';
import { V1GigDatesGetRequestQuery } from './types/requests/v1-gig-dates-get-request';
import type { V1GigDatesGetResponseBody } from './types/requests/v1-gig-dates-get-request';
import type { V1GigLookupResponseBody } from './types/requests/v1-gig-lookup-request';
import { V1GigLookupRequestBody } from './types/requests/v1-gig-lookup-request';

@Controller('gig')
export class GigController {
  constructor(private readonly gigService: GigService) {}

  @Version('1')
  @Get()
  getGigsV1(
    @Query() query: V1GigGetRequestQuery,
  ): Promise<V1GetGigsResponseBody> {
    return this.gigService.getPublishedGigsV1(query);
  }

  /**
   * Returns all (future) gig dates for the given location.
   * Used to power the calendar day enable/disable state without relying on feed pagination.
   */
  @Version('1')
  @Get('dates')
  getGigDatesV1(
    @Query() query: V1GigDatesGetRequestQuery,
  ): Promise<V1GigDatesGetResponseBody> {
    return this.gigService.getPublishedGigDatesV1(query);
  }

  /**
   * Looks up gig details (future gigs only) by "name + place"
   * and returns a draft object compatible with `GigDto`.
   */
  @Version('1')
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  // TODO: some security
  async lookupGigV1(
    @Body() body: V1GigLookupRequestBody,
  ): Promise<V1GigLookupResponseBody> {
    return this.gigService.lookupGigV1(body);
  }
}
