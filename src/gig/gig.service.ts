import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { GetGigsDto, GigDto, GigId, SubmitGigDto } from './dto/gig.dto';
import { Gig, GigDocument } from '../schemas/gig.schema';
import { Status } from './enums/status.enum';
import { PublisherService } from '../publisher/publisher.service';

// TODO: add allowing only specific status transitions
@Injectable()
export class GigService {
  constructor(
    @InjectModel(Gig.name) private gigModel: Model<Gig>,
    private readonly publisherService: PublisherService,
  ) {}

  async handleGigSubmit(data: SubmitGigDto): Promise<void> {
    // TODO: add transaction?
    const savedGig = await this.saveGig(data.gig);
    await this.publisherService.publishDraft(savedGig);
  }

  private async saveGig(data: GigDto): Promise<GigDocument> {
    const mappedData = {
      title: data.title,
      date: new Date(data.date).getTime(),
      location: data.location,
      ticketsUrl: data.ticketsUrl,
    };
    const createdGig = new this.gigModel(mappedData);
    return createdGig.save();
  }

  async handleGigApprove(gigId: GigId): Promise<void> {
    // TODO: add transaction?
    const updatedGig = await this.updateGigStatus(gigId, Status.approved);
    await this.publisherService.publish(updatedGig);
    await this.updateGigStatus(gigId, Status.published);
  }

  private async updateGigStatus(
    gigId: GigId,
    status: Status,
  ): Promise<GigDocument> {
    if (!Types.ObjectId.isValid(gigId)) {
      throw new BadRequestException(`Invalid MongoDB ID: ${gigId}`);
    }
    const updatedGig = await this.gigModel.findByIdAndUpdate(
      gigId,
      { status },
      { new: true },
    );

    if (!updatedGig) {
      throw new NotFoundException(`Gig with ID ${gigId} not found`);
    }

    return updatedGig;
  }

  async getGigs(data: GetGigsDto): Promise<GigDocument[]> {
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
}
