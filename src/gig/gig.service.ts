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
import { ChatId } from '../bot/dto/message.dto';
import { CalendarService } from '../calendar/calendar.service';
import { BotService } from '../bot/bot.service';

// TODO: add allowing only specific status transitions
@Injectable()
export class GigService {
  constructor(
    @InjectModel(Gig.name) private gigModel: Model<Gig>,
    private readonly calendarService: CalendarService,
    private readonly botService: BotService,
  ) {}

  async handleGigSubmit(data: SubmitGigDto): Promise<void> {
    // TODO: add transaction?
    const savedGig = await this.saveGig(data.gig);
    await this.publishDraft(savedGig);
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
    await this.publish(updatedGig);
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

  async #publish(gig: GigDocument, chatId: ChatId): Promise<void> {
    // Set start time to 8:00 PM
    const startDateTime = new Date(gig.date);
    startDateTime.setHours(20, 0, 0, 0); // Set to 8:00 PM (20:00)

    // Calculate end time (2 hours later)
    const endDateTime = new Date(startDateTime);
    endDateTime.setHours(startDateTime.getHours() + 2); // Add 2 hours

    await this.calendarService.addEvent({
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      location: gig.location,
      startDate: startDateTime,
      endDate: endDateTime,
    });

    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short', // e.g., "Nov"
      day: '2-digit',
    });
    const formattedDate = dateFormatter.format(new Date(gig.date));

    const text = [
      gig.title,
      '',
      `🗓 ${formattedDate}`,
      `📍 ${gig.location}`,
      '',
      `🎫 ${gig.ticketsUrl}`,
    ].join('\n');

    await this.botService.sendMessage({
      chatId,
      text,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ Approve',
              callback_data: `approve:${gig._id}`,
            },
            {
              text: '❌ Deny',
              callback_data: `deny:${gig._id}`,
            },
          ],
        ],
      },
    });
  }

  async publish(gig: GigDocument): Promise<void> {
    const chatId = process.env.MAIN_CHANNEL_ID;
    await this.#publish(gig, chatId);
  }

  async publishDraft(gig: GigDocument): Promise<void> {
    const chatId = process.env.DRAFT_CHANNEL_ID;
    await this.#publish(gig, chatId);
  }
}
