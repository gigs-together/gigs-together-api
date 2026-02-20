import { BadRequestException, Injectable } from '@nestjs/common';
import { Gig, GigPoster } from './gig.schema';
import { firstValueFrom } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BucketService } from '../bucket/bucket.service';
import { HttpService } from '@nestjs/axios';
import sharp from 'sharp';

interface PosterFile {
  buffer: Buffer;
  filename: string;
  mimetype?: string;
}

interface UploadPosterPayload {
  url?: string;
  file?: Express.Multer.File;
  context: {
    date: string | number | Date;
    country: string;
    city: string;
    publicId: string;
  };
}

@Injectable()
export class GigPosterService {
  constructor(
    @InjectModel(Gig.name) private gigModel: Model<Gig>,
    private readonly bucketService: BucketService,
    private readonly httpService: HttpService,
  ) {}

  private async download(url: string): Promise<PosterFile> {
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

  private getBucketPrefix(): string {
    const raw = (process.env.S3_POSTERS_PREFIX ?? 'gigs').trim();
    // Normalize: remove leading/trailing slashes so callers can safely do `${prefix}/...`.
    const normalized = raw.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) return 'gigs';
    // Hardening: prevent weird traversal-ish values.
    if (normalized.includes('..') || normalized.includes('\\')) return 'gigs';
    return normalized;
  }

  private getUtcYear(date: string | number | Date | undefined): number {
    if (!date) return new Date().getUTCFullYear();
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getUTCFullYear();
    return Number.isFinite(year) ? year : new Date().getUTCFullYear();
  }

  private getNormalizedCity(raw: string): string {
    // TODO: real mapping (this is currently a temporary hack)
    const TEMP_BARCELONA = 'barcelona';
    const city = (raw ?? '').trim().toLowerCase();
    return city === TEMP_BARCELONA ? TEMP_BARCELONA : 'unknown';
  }

  private getFileExtension(input: {
    filename?: string;
    mimetype?: string;
  }): string {
    const fromName = input.filename
      ?.split('.')
      .filter(Boolean)
      .pop()
      ?.trim()
      .toLowerCase();
    const safeFromName =
      fromName && /^[a-z]{1,10}$/.test(fromName) ? fromName : undefined;

    if (safeFromName) {
      return safeFromName;
    }

    const fromMime = () => {
      switch (input.mimetype) {
        case 'image/jpeg':
        case 'image/jpg':
          return 'jpg';
        case 'image/png':
          return 'png';
        case 'image/webp':
          return 'webp';
        case 'image/gif':
          return 'gif';
        case 'image/avif':
          return 'avif';
        default:
          return undefined;
      }
    };

    return fromMime() ?? 'jpg';
  }

  private buildBaseKey(context: UploadPosterPayload['context']): string {
    const year = this.getUtcYear(context.date);
    const city = this.getNormalizedCity(context.city);
    return [
      this.getBucketPrefix(),
      year,
      context.country.toLowerCase(),
      city,
      context.publicId,
    ].join('/');
  }

  private async uploadOriginalToBucket(
    input: PosterFile,
    context: UploadPosterPayload['context'],
  ): Promise<string> {
    const ext = this.getFileExtension(input);
    const key = `${this.buildBaseKey(context)}.${ext}`;

    return this.bucketService.upload({
      buffer: input.buffer,
      mimetype: input.mimetype,
      key,
    });
  }

  private async uploadThumbnailToBucket(
    input: PosterFile,
    context: UploadPosterPayload['context'],
  ): Promise<string> {
    const key = `${this.buildBaseKey(context)}-thumbnail.webp`;

    let thumb: Buffer;
    try {
      thumb = await sharp(input.buffer)
        .rotate()
        .resize({
          width: 512,
          height: 512,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
    } catch (e) {
      const msg = String(e?.message ?? 'unknown error');
      throw new BadRequestException(
        `Failed to create poster thumbnail: ${msg}`,
      );
    }

    return this.bucketService.upload({
      key,
      buffer: thumb,
      mimetype: 'image/webp',
    });
  }

  async upload(payload: UploadPosterPayload): Promise<GigPoster> | undefined {
    const { url, file, context } = payload;

    if (file) {
      const original: PosterFile = {
        buffer: file.buffer,
        filename: file.originalname,
        mimetype: file.mimetype,
      };
      const bucketPath = await this.uploadOriginalToBucket(original, context);
      const thumbnailBucketPath = await this.uploadThumbnailToBucket(
        original,
        context,
      );

      return { bucketPath, thumbnailBucketPath };
    }

    if (!url) return;

    // Reuse already downloaded poster if exists
    const existing = await this.gigModel.findOne({
      'poster.externalUrl': url,
    });

    // TODO: also look by poster equality?
    if (existing?.poster?.bucketPath) {
      return {
        bucketPath: existing.poster.bucketPath,
        thumbnailBucketPath: existing.poster.thumbnailBucketPath,
        externalUrl: url,
      };
    }

    const downloaded = await this.download(url);
    const bucketPath = await this.uploadOriginalToBucket(downloaded, context);
    const thumbnailBucketPath = await this.uploadThumbnailToBucket(
      downloaded,
      context,
    );
    return {
      bucketPath,
      thumbnailBucketPath,
      externalUrl: url,
    };
  }
}
