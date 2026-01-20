import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'stream';
import { GigService } from './modules/gig/gig.service';
import axios from 'axios';
import { envBool } from './shared/utils/env';
import { BucketService } from './modules/bucket/bucket.service';

@Injectable()
export class AppService {
  constructor(
    private readonly bucketService: BucketService,
    private readonly gigService: GigService,
  ) {}

  private readonly logger = new Logger(AppService.name);

  getRoot(): { ok: true; service: string } {
    return { ok: true, service: 'gigs-together-api' };
  }

  getHealth(): { ok: true } {
    return { ok: true };
  }

  async getPhotos(): Promise<{ photos: string[]; error?: string }> {
    try {
      const photos = await this.bucketService.listGigPhotos();
      return { photos };
    } catch (e) {
      // Should be rare (ReceiverService already tries hard to not throw),
      // but keep the endpoint stable.
      return {
        photos: [],
        error: e?.message ?? 'Failed to load photos',
      };
    }
  }

  async getPublicFileRedirectUrl(keys: string[]): Promise<string> {
    const key = keys.join('/');
    return await this.bucketService.getPresignedGigPhotoUrlByKey(key);
  }

  async writePublicFileProxy(keys: string[], res: Response): Promise<void> {
    const key = keys.join('/');
    const externalFallbackEnabled = envBool(
      'EXTERNAL_PHOTO_FALLBACK_ENABLED',
      true,
    );

    const obj = await this.bucketService.tryGetGigPhotoObjectByKey(key);
    if (!obj) {
      if (!externalFallbackEnabled) {
        throw new NotFoundException();
      }
      // Fallback to the original external URL (if present in DB) when the
      // stored S3 object is missing.
      const gig = await this.gigService.findByStoredPhotoKey(key);
      const externalUrl = gig?.photo?.externalUrl;
      if (!externalUrl) throw new NotFoundException();

      try {
        const upstream = await axios.get(externalUrl, {
          responseType: 'stream',
          timeout: 15_000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          validateStatus: () => true,
        });

        if (upstream.status < 200 || upstream.status >= 300) {
          throw new NotFoundException();
        }

        const ct = upstream.headers?.['content-type'];
        if (ct) res.setHeader('Content-Type', String(ct));

        // Don't cache too aggressively: external URL content may change.
        res.setHeader('Cache-Control', 'public, max-age=300');

        (upstream.data as NodeJS.ReadableStream).pipe(res);
        return;
      } catch (fallbackErr) {
        this.logger.warn(
          `files-proxy externalUrl fallback failed for key="${key}": ${JSON.stringify(
            (fallbackErr as any)?.message ?? fallbackErr,
          )}`,
        );
        throw new NotFoundException();
      }
    }

    if (!obj?.Body) throw new NotFoundException();

    if (obj.ContentType) res.setHeader('Content-Type', obj.ContentType);
    if (obj.ContentLength)
      res.setHeader('Content-Length', String(obj.ContentLength));
    if (obj.ETag) res.setHeader('ETag', obj.ETag);
    if (obj.LastModified)
      res.setHeader('Last-Modified', obj.LastModified.toUTCString());

    // Cache at the edge / browser a bit. The object key is immutable (uuid-based),
    // so it's safe to cache publicly.
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Body is a Node.js Readable in AWS SDK v3 (in Node runtime).
    const body = obj.Body;
    if (body instanceof Readable) {
      body.pipe(res);
      return;
    }

    // Fallback for non-stream bodies.
    const buf = await this.bucketService.readS3BodyToBuffer(body);
    res.end(buf);
  }
}
