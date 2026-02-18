import { BadRequestException, Injectable } from '@nestjs/common';
import { Gig, GigPoster } from './gig.schema';
import { firstValueFrom } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BucketService } from '../bucket/bucket.service';
import { HttpService } from '@nestjs/axios';
import { randomUUID } from 'crypto';

interface PosterFile {
  buffer: Buffer;
  filename: string;
  mimetype?: string;
}

interface UploadPosterPayload {
  url?: string;
  file?: Express.Multer.File;
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

  private async uploadToBucket(input: PosterFile): Promise<string> {
    const { buffer, filename, mimetype } = input;
    // TODO: instead of randomUUID gig publicId? + no filename
    const key = `${this.getBucketPrefix()}/${randomUUID()}-${input.filename}`;
    return this.bucketService.upload({
      buffer,
      filename,
      mimetype,
      key,
    });
  }

  async upload(payload: UploadPosterPayload): Promise<GigPoster> | undefined {
    const { url, file } = payload;

    if (file) {
      const bucketPath = await this.uploadToBucket({
        buffer: file.buffer,
        filename: file.originalname,
        mimetype: file.mimetype,
      });

      return { bucketPath };
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
        externalUrl: url,
      };
    }

    const downloaded = await this.download(url);
    return {
      bucketPath: await this.uploadToBucket(downloaded),
      externalUrl: url,
    };
  }
}
