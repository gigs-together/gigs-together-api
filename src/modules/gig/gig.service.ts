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
    const { page, size } = data;

    const MAX_SIZE = 100;
    if (size > MAX_SIZE) {
      throw new BadRequestException(
        `Size limit exceeded. Maximum size is ${MAX_SIZE}.`,
      );
    }

    const skip = (page - 1) * size;

    return this.gigModel.find({}).skip(skip).limit(size);
  }

  async getGigsV1(query: V1GigGetRequestQuery): Promise<V1GigGetResponseBody> {
    const { page = 1, size = 100 } = query;
    const gigs = await this.getGigs({ page, size });

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
              url: toPublicFilesProxyUrlFromStoredPhotoUrl(gig.photo.url),
            }
          : undefined,
      })) as GigDto[],
      // TODO
      isLastPage: true,
    };
  }

  async findByExternalPhotoUrl(
    externalUrl: string,
  ): Promise<GigDocument | null> {
    return this.gigModel.findOne({ 'photo.externalUrl': externalUrl });
  }
}
