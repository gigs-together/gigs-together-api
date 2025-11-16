import { Injectable } from '@nestjs/common';
import { GigDocument } from '../schemas/gig.schema';
import { CalendarService } from '../calendar/calendar.service';
import { BotService } from '../bot/bot.service';
import type { ChatId } from '../bot/dto/message.dto';

@Injectable()
export class PublisherService {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly botService: BotService,
  ) {}

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
      gig.title + '\n',
      'Date: ' + formattedDate,
      'Location: ' + gig.location,
      'Tickets: ' + gig.ticketsUrl,
    ].join('\n');

    await this.botService.sendMessage({ chatId, text });
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
