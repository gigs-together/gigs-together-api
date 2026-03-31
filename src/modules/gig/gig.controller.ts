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
  V1GigLookupRequestBodyValidated,
  V1GigLookupResponseBody,
} from './types/requests/v1-gig-lookup-request';
import { GigLookupBodyPipe } from './pipes/gig-lookup-body.pipe';
import { TelegramInitDataUserPipe } from '../telegram/pipes/telegram-init-data-user.pipe';
import {
  V1GigByPublicIdGetRequestParams,
  V1GigByPublicIdGetRequestQuery,
} from './types/requests/v1-gig-by-public-id-get-request';
import type { V1GigByPublicIdGetResponseBody } from './types/requests/v1-gig-by-public-id-get-request';
import type { V1GigGetForEditRequestBodyValidated } from './types/requests/v1-gig-get-for-edit-request';
import type { GigFormDataByPublicId } from './types/gig.types';
import { RequireTelegramAdminPipe } from '../telegram/pipes/require-telegram-admin.pipe';
import { AccessJwtAuthGuard } from '../telegram/guards/access-jwt-auth.guard';
import { TelegramInitDataAuthGuard } from '../telegram/guards/telegram-init-data-auth.guard';

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
   * Admin: draft gig fields for the edit form (Telegram WebApp).
   */
  // TODO: convert to GET?
  @Version('1')
  @Post('get')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessJwtAuthGuard, TelegramInitDataAuthGuard)
  getGigDraftForEdit(
    @Body(TelegramInitDataUserPipe, RequireTelegramAdminPipe)
    body: V1GigGetForEditRequestBodyValidated,
  ): Promise<GigFormDataByPublicId> {
    return this.gigService.getGigDraftForEditByPublicId(body.publicId);
  }

  /**
   * Public: minimal published gig by public id (id + date) for hash / deep-link anchor.
   */
  @Version('1')
  @Get(':publicId')
  getPublishedGigSummaryByPublicId(
    @Param() params: V1GigByPublicIdGetRequestParams,
    @Query() query: V1GigByPublicIdGetRequestQuery,
  ): Promise<V1GigByPublicIdGetResponseBody> {
    return this.gigService.getPublishedGigSummaryByPublicId({
      publicId: params.publicId,
      city: query.city,
      country: query.country,
    });
  }

  /**
   * Looks up gig details (future gigs only) by "name + place"
   * and returns a draft object compatible with `GigDto`.
   */
  @Version('1')
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessJwtAuthGuard, TelegramInitDataAuthGuard)
  async lookupGigV1(
    @Body(TelegramInitDataUserPipe, GigLookupBodyPipe)
    body: V1GigLookupRequestBodyValidated,
  ): Promise<V1GigLookupResponseBody> {
    return this.gigService.lookupGigV1(body);
  }
}
