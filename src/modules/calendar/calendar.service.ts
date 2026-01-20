import { Injectable, Logger } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import * as fs from 'fs';

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
  private readonly logger = new Logger(CalendarService.name);

  constructor() {
    this.ensureGoogleAuthKeyFile();

    const auth = new google.auth.GoogleAuth({
      keyFile: 'google-auth.json',
      // Scope for full calendar access
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    // Initialize Google Calendar API client
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  private ensureGoogleAuthKeyFile(): void {
    const keyFile = 'google-auth.json';
    if (fs.existsSync(keyFile)) return;

    const raw = process.env.GOOGLE_AUTH_JSON ?? '';

    if (!raw) {
      // Keep message actionable for Railway deploys.
      throw new Error(
        `Missing "${keyFile}". Provide GOOGLE_AUTH_JSON env var so the service can create it on startup.`,
      );
    }

    const tryParseJson = (text: string): Record<string, any> => {
      const trimmed = String(text ?? '').trim();
      return JSON.parse(trimmed);
    };

    let json: Record<string, any>;
    try {
      if (raw.trim().startsWith('{')) {
        json = tryParseJson(raw);
      } else {
        // Allow base64-encoded JSON as well (common for CI/hosting providers).
        const decoded = Buffer.from(raw.trim(), 'base64').toString('utf8');
        json = tryParseJson(decoded);
      }
    } catch (e) {
      throw new Error(
        `Invalid GOOGLE_AUTH_JSON: expected JSON string or base64-encoded JSON (${e?.message ?? e})`,
      );
    }

    try {
      fs.writeFileSync(keyFile, JSON.stringify(json, null, 2), {
        encoding: 'utf8',
      });
      this.logger.log(`Created ${keyFile} from env (GOOGLE_AUTH_JSON)`);
    } catch (e) {
      throw new Error(
        `Failed to write ${keyFile} from env: ${e?.message ?? e}`,
      );
    }
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
      this.logger.error(
        `Error creating event: ${e instanceof Error ? e.message : e}`,
        e instanceof Error ? e.stack : undefined,
      );
      throw new Error('Failed to create event.');
    }
  }
}
