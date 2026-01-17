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
  getGigsV1(
    @Query() query: V1GigGetRequestQuery,
  ): Promise<V1GigGetResponseBody> {
    return this.gigService.getGigsV1(query);
  }
}
