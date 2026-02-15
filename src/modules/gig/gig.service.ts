import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { UpdateQuery } from 'mongoose';
import { CreateGigInput, GetGigs, GigId } from './types/gig.types';
import { Gig, GigDocument } from './gig.schema';
import { Status } from './types/status.enum';
import { AiService } from '../ai/ai.service';
import type {
  V1GigGetRequestQuery,
  V1GetGigsResponseBody,
} from './types/requests/v1-gig-get-request';
import type { V1GigLookupRequestBody } from './types/requests/v1-gig-lookup-request';
import type { V1GigLookupResponseBody } from './types/requests/v1-gig-lookup-request';
import { toPublicFilesProxyUrlFromStoredPosterUrl } from '../../shared/utils/public-files';
import { envBool } from '../../shared/utils/env';
import {
  CalendarishEvent,
  CalendarService,
} from '../calendar/calendar.service';
import { GigPosterService } from './gig.poster.service';
import { TelegramService } from '../telegram/telegram.service';

// TODO: add allowing only specific status transitions
@Injectable()
export class GigService {
  constructor(
    @InjectModel(Gig.name) private gigModel: Model<Gig>,
    private readonly aiService: AiService,
    private readonly calendarService: CalendarService,
    private readonly gigPosterService: GigPosterService,
    private readonly telegramService: TelegramService,
  ) {}

  private async generateUniquePublicId(input: {
    title: string;
    yyyyMmDd: string;
    excludeMongoId?: Types.ObjectId;
  }): Promise<string> {
    const slugifyTitle = (rawTitle: string): string => {
      const str0 = (rawTitle ?? '').trim().toLowerCase();
      const str1 = str0
        .normalize('NFKD')
        // Remove diacritics (ASCII-friendly)
        .replace(/[\u0300-\u036f]/g, '');

      // Replace common separators with spaces to avoid accidental concatenations.
      const str2 = str1.replace(/[&+]/g, ' ');

      // Keep only a-z0-9 and convert any other run to a hyphen.
      const str3 = str2
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      return str3 || 'gig';
    };
    const base = `${slugifyTitle(input.title)}-${input.yyyyMmDd}`;

    for (let n = 0; n < 50; n++) {
      const candidate = n === 0 ? base : `${base}-${n + 1}`;
      const existing = await this.gigModel
        .findOne(
          {
            publicId: candidate,
            ...(input.excludeMongoId
              ? { _id: { $ne: input.excludeMongoId } }
              : {}),
          },
          { _id: 1 },
        )
        .lean();
      if (!existing) return candidate;
    }

    // Extremely unlikely fallback: add a short random suffix.
    const rnd = Math.random().toString(36).slice(2, 8);
    return `${base}-${rnd}`;
  }

  async saveGig(data: CreateGigInput): Promise<GigDocument> {
    const date = new Date(data.date);
    const yyyyMmDd = date.toISOString().split('T')[0];
    const publicId = await this.generateUniquePublicId({
      title: data.title,
      yyyyMmDd,
    });

    const mappedData: Gig = {
      publicId,
      title: data.title,
      date: date.getTime(),
      city: data.city,
      country: data.country,
      venue: data.venue,
      ticketsUrl: data.ticketsUrl,
      poster: data.poster,
      status: Status.New,
    };
    if (data.endDate) {
      mappedData.endDate = new Date(data.endDate).getTime();
    }

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
    const { page, size, from, to, status, city, country } = data;

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
    if (city && country) {
      filter.city = city;
      filter.country = country;
    }

    // Always keep pagination deterministic.
    // - date: primary sort
    // - _id: tie-breaker for equal dates
    return this.gigModel
      .find(filter)
      .collation({ locale: 'en', strength: 2 })
      .sort({ date: 1, _id: 1 })
      .skip(skip)
      .limit(size);
  }

  // TODO: add cache
  async getPublishedGigsV1(
    query: V1GigGetRequestQuery,
  ): Promise<V1GetGigsResponseBody> {
    const { page = 1, size = 100, from, to, city, country } = query;

    if (to !== undefined && to < from) {
      throw new BadRequestException('to must be >= from');
    }

    const gigs = await this.getGigs({
      page,
      size,
      from,
      to,
      status: Status.Published,
      city,
      country,
    });
    const externalFallbackEnabled = envBool(
      'EXTERNAL_POSTER_URL_FALLBACK_ENABLED',
      true,
    );

    const mapped: V1GetGigsResponseBody['gigs'] = [];
    for (const gig of gigs) {
      const calendarPayload = this.gigToCalendarPayload(gig);
      const calendarUrl =
        this.calendarService.getCreateCalendarEventUrl(calendarPayload);
      const chatUsername = gig.post?.chatId
        ? await this.telegramService.getChatUsername(gig.post.chatId)
        : undefined;
      const postUrl =
        chatUsername && gig.post.id
          ? `https://t.me/${chatUsername}/${gig.post.id}`
          : undefined;
      mapped.push({
        id: gig.publicId,
        title: gig.title,
        date: gig.date.toString(), // TODO
        endDate: gig.endDate?.toString(),
        city: gig.city,
        country: gig.country,
        venue: gig.venue,
        ticketsUrl: gig.ticketsUrl,
        calendarUrl,
        postUrl,
        posterUrl:
          (gig.poster?.bucketPath
            ? toPublicFilesProxyUrlFromStoredPosterUrl(gig.poster.bucketPath)
            : undefined) ??
          (externalFallbackEnabled ? gig.poster?.externalUrl : undefined),
      });
    }

    return {
      gigs: mapped,
    };
  }

  gigToCalendarPayload(gig: GigDocument): CalendarishEvent {
    const timeZone = 'Europe/Madrid';

    // Set start time to 8:00 PM
    const startDateTime = new Date(gig.date);
    startDateTime.setHours(20, 0, 0, 0); // 20:00

    // Calculate end time (2 hours later)
    const getDefaultEndDateTime = () =>
      new Date(startDateTime.getTime() + 2 * 60 * 60 * 1000);

    // If `endDate` exists (multi-day event), end on the last day.
    // We still default to an evening time window.
    const endDateTime = (() => {
      if (!gig.endDate) return getDefaultEndDateTime();

      const end = new Date(gig.endDate);
      end.setHours(22, 0, 0, 0); // 22:00 (20:00 + 2h)

      // Safety: never return an end before the start.
      return end.getTime() > startDateTime.getTime()
        ? end
        : getDefaultEndDateTime();
    })();

    return {
      title: gig.title,
      description: `Tickets: ${gig.ticketsUrl}`,
      location: [gig.venue, gig.city, gig.country] // TODO: add country name?
        .filter((str) => !!str)
        .join(', '),
      start: startDateTime,
      end: endDateTime,
      timeZone,
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

  async findByStoredPosterKey(key: string): Promise<GigDocument | null> {
    const normalized = (key ?? '').trim();
    if (!normalized) return null;
    // We store S3 keys as "/<prefix>/..." (leading slash).
    const withSlash = normalized.startsWith('/')
      ? normalized
      : `/${normalized}`;
    return this.gigModel.findOne({ 'poster.bucketPath': withSlash });
  }

  getCreateGigUploadedPosterData =
    this.gigPosterService.getCreateGigUploadedPosterData.bind(
      this.gigPosterService,
    );
}
