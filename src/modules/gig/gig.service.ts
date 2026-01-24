import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { UpdateQuery } from 'mongoose';
import type { GetGigs, GigDto, GigId } from './types/gig.types';
import { Gig, GigDocument } from './gig.schema';
import { Status } from './types/status.enum';
import { AiService } from '../ai/ai.service';
import type {
  V1GigGetRequestQuery,
  V1GigGetResponseBody,
} from './types/requests/v1-gig-get-request';
import type { V1GigLookupRequestBody } from './types/requests/v1-gig-lookup-request';
import type { V1GigLookupResponseBody } from './types/requests/v1-gig-lookup-request';
import { toPublicFilesProxyUrlFromStoredPosterUrl } from '../../shared/utils/public-files';
import { envBool } from '../../shared/utils/env';

// TODO: add allowing only specific status transitions
@Injectable()
export class GigService {
  constructor(
    @InjectModel(Gig.name) private gigModel: Model<Gig>,
    private readonly aiService: AiService,
  ) {}

  async saveGig(data: GigDto): Promise<GigDocument> {
    const mappedData = {
      title: data.title,
      date: new Date(data.date).getTime(),
      location: data.location,
      ticketsUrl: data.ticketsUrl,
      poster: data.poster,
    };
    const createdGig = new this.gigModel(mappedData);
    return createdGig.save();
  }

  async updateGig(gigId: GigId, data: UpdateQuery<Gig>): Promise<GigDocument> {
    if (!Types.ObjectId.isValid(gigId)) {
      throw new BadRequestException(`Invalid MongoDB ID: ${gigId}`);
    }
    const updatedGig = await this.gigModel.findByIdAndUpdate(gigId, data, {
      new: true,
    });

    if (!updatedGig) {
      throw new NotFoundException(`Gig with ID ${gigId} not found`);
    }

    return updatedGig;
  }

  updateGigStatus(gigId: GigId, status: Status): Promise<GigDocument> {
    return this.updateGig(gigId, { status });
  }

  async getGigs(data: GetGigs): Promise<GigDocument[]> {
    const { page, size, from, to, status } = data;

    const MAX_SIZE = 100;
    if (size > MAX_SIZE) {
      throw new BadRequestException(
        `Size limit exceeded. Maximum size is ${MAX_SIZE}.`,
      );
    }

    const skip = (page - 1) * size;

    const dateFilter: { $gte: number; $lte?: number } = { $gte: from };
    if (to !== undefined) dateFilter.$lte = to;

    const filter: Record<string, unknown> = { date: dateFilter };
    if (status) filter.status = status;

    // Always keep pagination deterministic.
    // - date: primary sort
    // - _id: tie-breaker for equal dates
    return this.gigModel
      .find(filter)
      .sort({ date: 1, _id: 1 })
      .skip(skip)
      .limit(size);
  }

  async getPublishedGigsV1(
    query: V1GigGetRequestQuery,
  ): Promise<V1GigGetResponseBody> {
    const { page = 1, size = 100, from, to } = query;

    if (to !== undefined && to < from) {
      throw new BadRequestException('to must be >= from');
    }

    const gigs = await this.getGigs({
      page,
      size,
      from,
      to,
      status: Status.Published,
    });
    const externalFallbackEnabled = envBool(
      'EXTERNAL_POSTER_URL_FALLBACK_ENABLED',
      true,
    );

    return {
      gigs: gigs.map((gig) => ({
        title: gig.title,
        date: gig.date.toString(), // TODO
        location: gig.location,
        venue: gig.venue,
        ticketsUrl: gig.ticketsUrl,
        status: gig.status,
        poster: gig.poster
          ? {
              tgFileId: gig.poster.tgFileId,
              url:
                toPublicFilesProxyUrlFromStoredPosterUrl(
                  gig.poster.bucketPath,
                ) ??
                (externalFallbackEnabled ? gig.poster.externalUrl : undefined),
            }
          : undefined,
      })),
    };
  }

  async lookupGigV1(
    body: V1GigLookupRequestBody,
  ): Promise<V1GigLookupResponseBody> {
    const gig = await this.aiService.lookupGigV1({
      name: body.name,
      location: body.location,
    });
    return { gig };
  }

  async findByExternalPosterUrl(
    externalUrl: string,
  ): Promise<GigDocument | null> {
    return this.gigModel.findOne({ 'poster.externalUrl': externalUrl });
  }

  async findByStoredPosterKey(key: string): Promise<GigDocument | null> {
    const normalized = (key ?? '').trim();
    if (!normalized) return null;
    // We store S3 keys as "/<prefix>/..." (leading slash).
    const withSlash = normalized.startsWith('/')
      ? normalized
      : `/${normalized}`;
    return this.gigModel.findOne({ 'poster.bucketPath': withSlash });
  }
}
