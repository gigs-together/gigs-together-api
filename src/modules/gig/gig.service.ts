import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model, UpdateQuery } from 'mongoose';
import type {
  CreateGigInput,
  GetGigs,
  GigFormDataByPublicId,
  GigId,
} from './types/gig.types';
import { Gig } from './gig.schema';
import type { GigDocument } from './gig.schema';
import { Status } from './types/status.enum';
import { AiService } from '../ai/ai.service';
import type {
  V1GigGetRequestQuery,
  V1GetGigsResponseBody,
} from './types/requests/v1-gig-get-request';
import type {
  V1GigDatesGetRequestQuery,
  V1GigDatesGetResponseBody,
} from './types/requests/v1-gig-dates-get-request';
import type {
  V1GigAroundGetRequestQuery,
  V1GigAroundGetResponseBody,
} from './types/requests/v1-gig-around-get-request';
import type {
  V1GigByPublicIdGetInput,
  V1GigByPublicIdGetResponseBody,
} from './types/requests/v1-gig-by-public-id-get-request';
import { startOfTodayMs } from './types/requests/v1-gig-date-range.shared';
import type { V1GigLookupRequestBody } from './types/requests/v1-gig-lookup-request';
import type { V1GigLookupResponseBody } from './types/requests/v1-gig-lookup-request';
import { envBool } from '../../shared/utils/env';
import { CalendarService } from '../calendar/calendar.service';
import type { CalendarishEvent } from '../calendar/calendar.service';
import { GigPosterService } from './gig.poster.service';
import { TelegramService } from '../telegram/telegram.service';
import { BucketService } from '../bucket/bucket.service';
import { PostType } from './types/postType.enum';
import { Messenger } from './types/messenger.enum';
import { decodeGigCursorOrThrow, encodeGigCursor } from './utils/gig-cursor';

interface GetPostUrlPayload {
  postId?: number;
  chatId?: number;
}

// TODO: add allowing only specific status transitions
@Injectable()
export class GigService {
  private static readonly MAX_PUBLIC_ID_LEN = 64;
  private static readonly MAX_LIMIT = 100;

  constructor(
    @InjectModel(Gig.name) private gigModel: Model<Gig>,
    private readonly aiService: AiService,
    private readonly calendarService: CalendarService,
    private readonly gigPosterService: GigPosterService,
    private readonly bucketService: BucketService,
    private readonly telegramService: TelegramService,
  ) {}

  private normalizeAndValidatePublicIdOrThrow(publicId: string): string {
    const id = (publicId ?? '').trim();
    if (!id) {
      throw new BadRequestException('publicId is required');
    }
    if (id.length > GigService.MAX_PUBLIC_ID_LEN) {
      throw new BadRequestException(
        `publicId is too long (max ${GigService.MAX_PUBLIC_ID_LEN})`,
      );
    }
    // Keep it strict and URL/anchor safe (also matches our generator).
    if (!/^[a-z0-9-]+$/.test(id)) {
      throw new BadRequestException('publicId has invalid characters');
    }
    return id;
  }

  async generateUniquePublicId(input: {
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
    const yyyyMmDd = String(input.yyyyMmDd ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
      throw new BadRequestException(
        'Invalid yyyyMmDd format (expected YYYY-MM-DD)',
      );
    }

    const buildCandidate = (n: number): string => {
      const suffix = n === 0 ? '' : `-${n + 1}`;
      const reserved = 1 + yyyyMmDd.length + suffix.length; // "-" + date + suffix
      const maxSlugLen = Math.max(1, GigService.MAX_PUBLIC_ID_LEN - reserved);

      let slug = slugifyTitle(input.title);
      if (slug.length > maxSlugLen) {
        slug = slug.slice(0, maxSlugLen).replace(/-+$/g, '');
      }
      if (!slug) slug = 'gig';

      const candidate = `${slug}-${yyyyMmDd}${suffix}`;
      // Safety guard (shouldn't happen, but keeps contract tight)
      return candidate.length > GigService.MAX_PUBLIC_ID_LEN
        ? candidate.slice(0, GigService.MAX_PUBLIC_ID_LEN).replace(/-+$/g, '')
        : candidate;
    };

    for (let n = 0; n < 50; n++) {
      const candidate = buildCandidate(n);
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
    // Ensure fallback respects MAX_PUBLIC_ID_LEN
    const prefixMax = Math.max(
      1,
      GigService.MAX_PUBLIC_ID_LEN - (1 + rnd.length),
    );
    const prefix = buildCandidate(0).slice(0, prefixMax).replace(/-+$/g, '');
    return `${prefix}-${rnd}`;
  }

  async saveGig(data: CreateGigInput): Promise<GigDocument> {
    const date = new Date(data.date);

    const mappedData: Gig = {
      publicId: data.publicId,
      title: data.title,
      date: date.getTime(),
      city: data.city,
      country: data.country,
      venue: data.venue,
      ticketsUrl: data.ticketsUrl,
      poster: data.poster,
      status: Status.New,
      posts: [],
      suggestedBy: data.suggestedBy,
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

  async updateTelegramPostFileId(payload: {
    gigId: GigId;
    type: PostType;
    fileId: string;
  }): Promise<void> {
    const { gigId, type, fileId } = payload;
    if (!Types.ObjectId.isValid(gigId)) {
      throw new BadRequestException(`Invalid MongoDB ID: ${gigId}`);
    }

    await this.gigModel.updateOne(
      {
        _id: gigId,
        posts: { $elemMatch: { to: Messenger.Telegram, type } },
      },
      {
        $set: {
          'posts.$.fileId': fileId,
        },
      },
    );
  }

  async getGigByPublicIdOrThrow(publicId: string): Promise<GigDocument> {
    const id = this.normalizeAndValidatePublicIdOrThrow(publicId);
    const gig = await this.gigModel.findOne({ publicId: id });
    if (!gig) {
      throw new NotFoundException(`Gig with publicId "${id}" not found`);
    }
    return gig;
  }

  async updateGigByPublicId(
    publicId: string,
    data: UpdateQuery<Gig>,
  ): Promise<GigDocument> {
    const id = this.normalizeAndValidatePublicIdOrThrow(publicId);

    const updated = await this.gigModel.findOneAndUpdate(
      { publicId: id },
      data,
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException(`Gig with publicId "${id}" not found`);
    }
    return updated;
  }

  async getGigFormDataByPublicId(
    publicId: string,
  ): Promise<GigFormDataByPublicId> {
    const gig = await this.getGigByPublicIdOrThrow(publicId);

    const externalFallbackEnabled = envBool(
      'EXTERNAL_POSTER_URL_FALLBACK_ENABLED',
      true,
    );

    const msToYmd = (ms?: number): string | undefined => {
      if (!ms) return undefined;
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) return undefined;
      return d.toISOString().slice(0, 10);
    };

    const posterUrl =
      (gig.poster?.bucketPath
        ? this.bucketService.getPublicFileUrl(gig.poster.bucketPath)
        : undefined) ??
      (externalFallbackEnabled ? gig.poster?.externalUrl : undefined);

    return {
      publicId: gig.publicId,
      title: gig.title,
      date: msToYmd(gig.date) ?? '',
      endDate: msToYmd(gig.endDate),
      city: gig.city,
      country: gig.country,
      venue: gig.venue,
      ticketsUrl: gig.ticketsUrl,
      posterUrl,
    };
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

  private async getPostUrl(
    payload: GetPostUrlPayload,
  ): Promise<string | undefined> {
    const { postId, chatId } = payload;

    if (!chatId) {
      return;
    }

    const chatUsername = chatId
      ? await this.telegramService.getChatUsername(chatId)
      : undefined;

    return chatUsername && postId
      ? this.telegramService.getPostUrl({
          chatUsername,
          messageId: postId,
        })
      : undefined;
  }

  private async mapGigsToV1Gigs(
    gigs: GigDocument[],
  ): Promise<V1GetGigsResponseBody['gigs']> {
    const externalFallbackEnabled = envBool(
      'EXTERNAL_POSTER_URL_FALLBACK_ENABLED',
      true,
    );

    const mapped: V1GetGigsResponseBody['gigs'] = [];
    for (const gig of gigs) {
      const publishedPost = this.telegramService.pickTgPost(
        gig.posts,
        PostType.Publish,
      );

      const postUrl = await this.getPostUrl({
        postId: publishedPost?.id,
        chatId: publishedPost?.chatId,
      });

      const calendarPayload = this.gigToCalendarPayload(gig);
      const calendarUrl =
        this.calendarService.getCreateCalendarEventUrl(calendarPayload);

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
            ? this.bucketService.getPublicFileUrl(gig.poster.bucketPath)
            : undefined) ??
          (externalFallbackEnabled ? gig.poster?.externalUrl : undefined),
      });
    }

    return mapped;
  }

  async getPublishedGigsV1(
    query: V1GigGetRequestQuery,
  ): Promise<V1GetGigsResponseBody> {
    const {
      limit = 100,
      cursor,
      from,
      to,
      city,
      country,
      direction = 'next',
    } = query;

    if (to !== undefined && to < from) {
      throw new BadRequestException('to must be >= from');
    }

    if (limit > GigService.MAX_LIMIT) {
      throw new BadRequestException(
        `Size limit exceeded. Maximum size is ${GigService.MAX_LIMIT}.`,
      );
    }

    const dateFilter: { $gte: number; $lte?: number } = { $gte: from };
    if (to !== undefined) dateFilter.$lte = to;

    const baseFilter: Record<string, unknown> = {
      status: Status.Published,
      date: dateFilter,
    };
    if (city && country) {
      baseFilter.city = city;
      baseFilter.country = country;
    }

    const and: Record<string, unknown>[] = [baseFilter];

    if (cursor) {
      const decoded = decodeGigCursorOrThrow(cursor);
      const cursorId = new Types.ObjectId(decoded.mongoId);
      and.push(
        direction === 'prev'
          ? {
              $or: [
                { date: { $lt: decoded.date } },
                { date: decoded.date, _id: { $lt: cursorId } },
              ],
            }
          : {
              $or: [
                { date: { $gt: decoded.date } },
                { date: decoded.date, _id: { $gt: cursorId } },
              ],
            },
      );
    }

    const filter: Record<string, unknown> =
      and.length === 1 ? and[0] : { $and: and };

    const sort: Record<string, 1 | -1> =
      direction === 'prev' ? { date: -1, _id: -1 } : { date: 1, _id: 1 };

    const docs = await this.gigModel
      .find(filter)
      .collation({ locale: 'en', strength: 2 })
      .sort(sort)
      .limit(limit + 1);

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;

    // Keep the public API consistent: always return gigs ordered ascending.
    const gigsAsc = direction === 'prev' ? page.slice().reverse() : page;
    const mapped = await this.mapGigsToV1Gigs(gigsAsc);

    if (direction === 'prev') {
      const prevCursor =
        hasMore && gigsAsc.length > 0
          ? encodeGigCursor({
              date: gigsAsc[0].date,
              mongoId: String(gigsAsc[0]._id),
            })
          : undefined;

      return { gigs: mapped, prevCursor };
    }

    // Provide a cursor for loading items before the current window without additional lookups.
    // Note: this cursor does NOT guarantee that earlier items exist.
    const prevCursor =
      gigsAsc.length > 0
        ? encodeGigCursor({
            date: gigsAsc[0].date,
            mongoId: String(gigsAsc[0]._id),
          })
        : undefined;

    const nextCursor =
      hasMore && gigsAsc.length > 0
        ? encodeGigCursor({
            date: gigsAsc[gigsAsc.length - 1].date,
            mongoId: String(gigsAsc[gigsAsc.length - 1]._id),
          })
        : undefined;

    return { gigs: mapped, prevCursor, nextCursor };
  }

  async getPublishedGigByPublicIdV1(
    input: V1GigByPublicIdGetInput,
  ): Promise<V1GigByPublicIdGetResponseBody> {
    const publicId = this.normalizeAndValidatePublicIdOrThrow(input.publicId);

    const filter: Record<string, unknown> = {
      publicId,
      status: Status.Published,
    };
    if (input.city && input.country) {
      filter.city = input.city;
      filter.country = input.country;
    }

    const doc = await this.gigModel
      .findOne(filter)
      .collation({ locale: 'en', strength: 2 });

    if (!doc) {
      throw new NotFoundException(`Gig with publicId "${publicId}" not found`);
    }

    const mapped = await this.mapGigsToV1Gigs([doc]);
    if (!mapped[0]) {
      throw new Error('Failed to map gig');
    }

    return { gig: mapped[0] };
  }

  async getPublishedGigsAroundV1(
    query: V1GigAroundGetRequestQuery,
  ): Promise<V1GigAroundGetResponseBody> {
    const {
      anchor,
      beforeLimit = 100,
      afterLimit = 100,
      city,
      country,
    } = query;

    if (
      beforeLimit > GigService.MAX_LIMIT ||
      afterLimit > GigService.MAX_LIMIT
    ) {
      throw new BadRequestException(
        `Size limit exceeded. Maximum size is ${GigService.MAX_LIMIT}.`,
      );
    }

    const baseFilter: Record<string, unknown> = {
      status: Status.Published,
    };
    if (city && country) {
      baseFilter.city = city;
      baseFilter.country = country;
    }

    const beforeDocsDesc =
      beforeLimit === 0
        ? []
        : await this.gigModel
            .find({
              ...baseFilter,
              date: { $gte: startOfTodayMs(), $lt: anchor },
            })
            .collation({ locale: 'en', strength: 2 })
            .sort({ date: -1, _id: -1 })
            .limit(beforeLimit + 1);

    const hasPrev = beforeDocsDesc.length > beforeLimit;
    const beforeDesc = hasPrev
      ? beforeDocsDesc.slice(0, beforeLimit)
      : beforeDocsDesc;
    const beforeDocsAsc = beforeDesc.slice().reverse();

    const afterDocsAsc0 = await this.gigModel
      .find({
        ...baseFilter,
        date: { $gte: anchor },
      })
      .collation({ locale: 'en', strength: 2 })
      .sort({ date: 1, _id: 1 })
      .limit(afterLimit + 1);

    const hasNext = afterDocsAsc0.length > afterLimit;
    const afterDocsAsc = hasNext
      ? afterDocsAsc0.slice(0, afterLimit)
      : afterDocsAsc0;

    const before = await this.mapGigsToV1Gigs(beforeDocsAsc);
    const after = await this.mapGigsToV1Gigs(afterDocsAsc);

    const prevCursor =
      hasPrev && beforeDocsAsc.length > 0
        ? encodeGigCursor({
            date: beforeDocsAsc[0].date,
            mongoId: String(beforeDocsAsc[0]._id),
          })
        : undefined;

    const nextCursor =
      hasNext && afterDocsAsc.length > 0
        ? encodeGigCursor({
            date: afterDocsAsc[afterDocsAsc.length - 1].date,
            mongoId: String(afterDocsAsc[afterDocsAsc.length - 1]._id),
          })
        : undefined;

    return { before, after, prevCursor, nextCursor };
  }

  async getPublishedGigDatesV1(
    query: V1GigDatesGetRequestQuery,
  ): Promise<V1GigDatesGetResponseBody> {
    const { from, to, city, country } = query;

    if (to !== undefined && to < from) {
      throw new BadRequestException('to must be >= from');
    }

    const dateFilter: { $gte: number; $lte?: number } = { $gte: from };
    if (to !== undefined) dateFilter.$lte = to;

    const filter: Record<string, unknown> = {
      status: Status.Published,
      date: dateFilter,
    };

    if (city && country) {
      filter.city = city;
      filter.country = country;
    }

    // Aggregate unique dates without loading full docs.
    const rows = await this.gigModel
      .aggregate<{
        _id: number;
      }>([
        { $match: filter },
        { $group: { _id: '$date' } },
        { $sort: { _id: 1 } },
      ])
      .allowDiskUse(true);

    return {
      dates: rows.map((r) => String(r._id)),
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

  uploadPoster: GigPosterService['upload'] = this.gigPosterService.upload.bind(
    this.gigPosterService,
  );
}
