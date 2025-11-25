import { Injectable } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';

interface AddEventDto {
  title: string;
  ticketsUrl: string;
  location: string;
  startDate: Date;
  endDate: Date;
}

@Injectable()
export class CalendarService {
  private readonly calendar: calendar_v3.Calendar;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      keyFile: 'google-auth.json',
      // Scope for full calendar access
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    // Initialize Google Calendar API client
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  /**
   * Add a new event to the Google Calendar
   * @param eventDetails - Details of the event to create
   */
  async addEvent(eventDetails: AddEventDto): Promise<calendar_v3.Schema$Event> {
    const timeZone = 'Europe/Madrid';

    const event = {
      summary: eventDetails.title,
      description: `Tickets: ${eventDetails.ticketsUrl}`,
      location: eventDetails.location,
      start: {
        dateTime: eventDetails.startDate.toISOString(),
        timeZone,
      },
      end: {
        dateTime: eventDetails.endDate.toISOString(),
        timeZone,
      },
      colorId: '2',
    };

    try {
      const response = await this.calendar.events.insert({
        calendarId: process.env.CALENDAR_ID,
        requestBody: event,
      });
      return response.data;
    } catch (e) {
      console.error('Error creating event:', e.message);
      throw new Error('Failed to create event.');
    }
  }
}
