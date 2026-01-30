import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { UpdateQuery } from 'mongoose';
import { CreateGigInput, GetGigs, GigId } from './types/gig.types';
import { Gig, GigDocument, GigPoster } from './gig.schema';
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
import { BucketService } from '../bucket/bucket.service';
import { firstValueFrom } from 'rxjs';
import { getGigPostersPrefixWithSlash } from '../bucket/gig-posters';
import { HttpService } from '@nestjs/axios';

// TODO: add allowing only specific status transitions
@Injectable()
export class GigService {
  constructor(
    @InjectModel(Gig.name) private gigModel: Model<Gig>,
    private readonly aiService: AiService,
    private readonly calendarService: CalendarService,
    private readonly bucketService: BucketService,
    private readonly httpService: HttpService,
  ) {}

  async saveGig(data: CreateGigInput): Promise<GigDocument> {
    const mappedData = {
      title: data.title,
      date: new Date(data.date).getTime(),
      city: data.city,
      country: data.country,
      venue: data.venue,
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
      .sort({ date: 1, _id: 1 })
      .skip(skip)
      .limit(size);
  }

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

    return {
      gigs: gigs.map((gig) => {
        const calendarPayload = this.gigToCalendarPayload(gig);
        const calendarUrl =
          this.calendarService.getCreateCalendarEventUrl(calendarPayload);
        return {
          title: gig.title,
          date: gig.date.toString(), // TODO
          city: gig.city,
          country: gig.country,
          venue: gig.venue,
          ticketsUrl: gig.ticketsUrl,
          calendarUrl,
          status: gig.status,
          posterUrl:
            (gig.poster?.bucketPath
              ? toPublicFilesProxyUrlFromStoredPosterUrl(gig.poster.bucketPath)
              : undefined) ??
            (externalFallbackEnabled ? gig.poster?.externalUrl : undefined),
        };
      }),
    };
  }

  gigToCalendarPayload(gig: GigDocument): CalendarishEvent {
    const timeZone = 'Europe/Madrid';

    // Set start time to 8:00 PM
    const startDateTime = new Date(gig.date);
    startDateTime.setHours(20, 0, 0, 0); // 20:00

    // Calculate end time (2 hours later)
    const endDateTime = new Date(startDateTime);
    endDateTime.setHours(startDateTime.getHours() + 2);

    return {
      title: gig.title,
      description: `Tickets: ${gig.ticketsUrl}`,
      location: [gig.venue, gig.city, gig.country]
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

  // TODO: extract into gig.poster.service or smth
  private toStoredGigPosterPath(value: string): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return trimmed;

    const normalizeFromPathname = (pathname: string): string => {
      let p = (pathname ?? '').trim();
      if (!p) return p;

      // If stored as a public route, extract the S3 key part.
      const proxyPrefix = '/public/files-proxy/';
      const redirectPrefix = '/public/files/';
      if (p.startsWith(proxyPrefix)) p = `/${p.slice(proxyPrefix.length)}`;
      else if (p.startsWith(redirectPrefix))
        p = `/${p.slice(redirectPrefix.length)}`;

      const prefix = getGigPostersPrefixWithSlash(); // "<prefix>/"
      // Accept both "<prefix>/..." and "/<prefix>/..."
      if (p.startsWith(prefix)) return `/${p}`;
      if (p.startsWith(`/${prefix}`)) return p;

      return p;
    };

    // Absolute URL -> use pathname.
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        return normalizeFromPathname(new URL(trimmed).pathname);
      } catch {
        return trimmed;
      }
    }

    return normalizeFromPathname(trimmed);
  }

  private async downloadPoster(url: string): Promise<{
    buffer: Buffer;
    filename: string;
    mimetype?: string;
  }> {
    let filename = 'poster.jpg'; // TODO: jpg?
    try {
      const parsed = new URL(url);
      const last = parsed.pathname.split('/').filter(Boolean).pop();
      if (last) filename = last;
    } catch {
      throw new BadRequestException('posterUrl must be a valid URL');
    }

    try {
      const res = await firstValueFrom(
        this.httpService.get<ArrayBuffer>(url, {
          responseType: 'arraybuffer',
          timeout: 15_000,
        }),
      );
      const contentType =
        res.headers['content-type'] || res.headers['Content-Type'];
      const ct = Array.isArray(contentType) ? contentType[0] : contentType;

      if (ct && !ct.toLowerCase().startsWith('image/')) {
        throw new BadRequestException(
          `posterUrl must point to an image (content-type: "${ct}")`,
        );
      }

      return {
        buffer: Buffer.from(res.data),
        filename,
        mimetype: ct,
      };
    } catch (e) {
      // Keep message user-friendly; don't leak internals.
      const msg = String(e?.message ?? 'unknown error');
      throw new BadRequestException(`Failed to download poster: ${msg}`);
    }
  }

  async getCreateGigUploadedPosterData(payload: {
    url?: string;
    file?: Express.Multer.File;
  }): Promise<Omit<GigPoster, 'tgFileId'>> {
    const { url, file } = payload;

    let bucketPath: string | undefined;
    let externalUrl: string | undefined;

    if (file) {
      bucketPath = await this.bucketService.uploadGigPoster({
        buffer: file.buffer,
        filename: file.originalname,
        mimetype: file.mimetype,
      });
    } else if (url) {
      // Reuse already downloaded poster if exists
      const existing = await this.findByExternalPosterUrl(url);
      // TODO: also look by poster equality
      if (existing?.poster?.bucketPath) {
        bucketPath = this.toStoredGigPosterPath(existing.poster.bucketPath);
        externalUrl = url;
      } else {
        const downloaded = await this.downloadPoster(url);
        bucketPath = await this.bucketService.uploadGigPoster(downloaded);
        externalUrl = url;
      }
    }

    return {
      bucketPath,
      externalUrl,
    };
  }
}
