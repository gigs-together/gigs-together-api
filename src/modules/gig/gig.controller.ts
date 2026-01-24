import { Body, Controller, Get, Post, Query, Version } from '@nestjs/common';
import { GigService } from './gig.service';
import {
  V1GigGetRequestQuery,
  V1GigGetResponseBody,
} from './types/requests/v1-gig-get-request';
import type { V1GigLookupResponseBody } from './types/requests/v1-gig-lookup-request';
import { V1GigLookupRequestBody } from './types/requests/v1-gig-lookup-request';

@Controller('gig')
export class GigController {
  constructor(private readonly gigService: GigService) {}

  @Version('1')
  @Get()
  getGigsV1(
    @Query() query: V1GigGetRequestQuery,
  ): Promise<V1GigGetResponseBody> {
    return this.gigService.getPublishedGigsV1(query);
  }

  /**
   * Looks up gig details (future gigs only) by "name + place"
   * and returns a draft object compatible with `GigDto`.
   */
  @Version('1')
  @Post('lookup')
  async lookupGigV1(
    @Body() body: V1GigLookupRequestBody,
  ): Promise<V1GigLookupResponseBody> {
    return this.gigService.lookupGigV1(body);
  }
}
