import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import { GigService } from './gig.service';
import { V1GigGetRequestQuery } from './types/requests/v1-gig-get-request';
import type { V1GetGigsResponseBody } from './types/requests/v1-gig-get-request';
import { V1GigDatesGetRequestQuery } from './types/requests/v1-gig-dates-get-request';
import type { V1GigDatesGetResponseBody } from './types/requests/v1-gig-dates-get-request';
import { V1GigAroundGetRequestQuery } from './types/requests/v1-gig-around-get-request';
import type { V1GigAroundGetResponseBody } from './types/requests/v1-gig-around-get-request';
import type {
  V1GigLookupFields,
  V1GigLookupResponseBody,
} from './types/requests/v1-gig-lookup-request';
import { GigLookupBodyPipe } from './pipes/gig-lookup-body.pipe';
import { V1GigByPublicIdGetRequestParams } from './types/requests/v1-gig-by-public-id-get-request';
import type { V1GigByPublicIdGetResponseBody } from './types/requests/v1-gig-by-public-id-get-request';
import type { GigFormDataByPublicId } from './types/gig.types';
import { RequireAuthenticatedUserGuard } from '../auth/guards/require-authenticated-user.guard';
import { AccessJwtAuthGuard } from '../auth/guards/access-jwt-auth.guard';
import { RequireAdminGuard } from '../admin/guards/require-admin.guard';

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
   * Loads a chunk before + a chunk from the anchor date in a single request.
   */
  @Version('1')
  @Get('around')
  getGigsAroundV1(
    @Query() query: V1GigAroundGetRequestQuery,
  ): Promise<V1GigAroundGetResponseBody> {
    return this.gigService.getPublishedGigsAroundV1(query);
  }

  /**
   * Public: anchor calendar date for hash / deep links (`{ date }` only).
   */
  @Version('1')
  @Get('date/:publicId')
  getGigDateByPublicId(
    @Param() params: V1GigByPublicIdGetRequestParams,
  ): Promise<V1GigByPublicIdGetResponseBody> {
    return this.gigService.getGigDateByPublicId({
      publicId: params.publicId,
    });
  }

  /**
   * Admin-only: full gig form fields by `publicId` (any status; for display / edit UI).
   */
  @Version('1')
  @Get(':publicId')
  @UseGuards(
    AccessJwtAuthGuard,
    RequireAuthenticatedUserGuard,
    RequireAdminGuard,
  )
  getGigByPublicId(
    @Param() params: V1GigByPublicIdGetRequestParams,
  ): Promise<GigFormDataByPublicId> {
    return this.gigService.getGigByPublicId(params.publicId);
  }

  /**
   * Looks up gig details (future gigs only) by "name + place"
   * and returns a draft object compatible with `GigDto`.
   */
  @Version('1')
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AccessJwtAuthGuard,
    RequireAuthenticatedUserGuard,
    RequireAdminGuard,
  )
  async lookupGigV1(
    @Body(GigLookupBodyPipe) fields: V1GigLookupFields,
  ): Promise<V1GigLookupResponseBody> {
    return this.gigService.lookupGigV1(fields);
  }
}
