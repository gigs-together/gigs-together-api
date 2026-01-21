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
import type {
  V1GigGetRequestQuery,
  V1GigGetResponseBody,
} from './types/requests/v1-gig-get-request';
import { toPublicFilesProxyUrlFromStoredPhotoUrl } from '../../shared/utils/public-files';
import { envBool } from '../../shared/utils/env';

// TODO: add allowing only specific status transitions
@Injectable()
export class GigService {
  constructor(@InjectModel(Gig.name) private gigModel: Model<Gig>) {}

  async saveGig(data: GigDto): Promise<GigDocument> {
    const mappedData = {
      title: data.title,
      date: new Date(data.date).getTime(),
      location: data.location,
      ticketsUrl: data.ticketsUrl,
      photo: data.photo,
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
      'EXTERNAL_PHOTO_FALLBACK_ENABLED',
      true,
    );

    return {
      gigs: gigs.map((gig) => ({
        title: gig.title,
        date: gig.date.toString(), // TODO
        location: gig.location,
        ticketsUrl: gig.ticketsUrl,
        status: gig.status,
        photo: gig.photo
          ? {
              tgFileId: gig.photo.tgFileId,
              url:
                toPublicFilesProxyUrlFromStoredPhotoUrl(gig.photo.url) ??
                (externalFallbackEnabled ? gig.photo.externalUrl : undefined),
            }
          : undefined,
      })),
    };
  }

  async findByExternalPhotoUrl(
    externalUrl: string,
  ): Promise<GigDocument | null> {
    return this.gigModel.findOne({ 'photo.externalUrl': externalUrl });
  }

  async findByStoredPhotoKey(key: string): Promise<GigDocument | null> {
    const normalized = (key ?? '').trim();
    if (!normalized) return null;
    // We store S3 keys as "/<prefix>/..." (leading slash).
    const withSlash = normalized.startsWith('/')
      ? normalized
      : `/${normalized}`;
    return this.gigModel.findOne({ 'photo.url': withSlash });
  }
}
