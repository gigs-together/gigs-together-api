import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { Readable } from 'stream';
import { ReceiverService } from './modules/receiver/receiver.service';
import { GetObjectCommandOutput } from '@aws-sdk/client-s3';

@Injectable()
export class AppService {
  constructor(private readonly receiverService: ReceiverService) {}

  private readonly logger = new Logger(AppService.name);

  getRoot(): { ok: true; service: string } {
    return { ok: true, service: 'gigs-together-api' };
  }

  getHealth(): { ok: true } {
    return { ok: true };
  }

  async getPhotos(): Promise<{ photos: string[]; error?: string }> {
    try {
      const photos = await this.receiverService.listGigPhotos();
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

  private rethrowPublicFileError(route: string, key: string, e: any): never {
    const name = e?.name;
    const code = e?.Code ?? e?.code;
    const status = e?.$metadata?.httpStatusCode;
    const message = String(e?.message ?? '');

    // Normalize the most common S3 errors.
    if (
      name === 'NoSuchKey' ||
      code === 'NoSuchKey' ||
      status === 404 ||
      /nosuchkey/i.test(message)
    ) {
      throw new NotFoundException();
    }
    if (
      name === 'AccessDenied' ||
      code === 'AccessDenied' ||
      status === 403 ||
      /accessdenied/i.test(message)
    ) {
      throw new ForbiddenException();
    }

    // Any other failure: log with an id so it's easy to find in server logs.
    const errorId = randomUUID();
    this.logger.error(
      `[${errorId}] ${route} failed for key="${String(key)}": ${JSON.stringify({
        name,
        code,
        status,
        message,
      })}`,
      e?.stack,
    );
    throw new InternalServerErrorException(
      `Internal server error (ref: ${errorId})`,
    );
  }

  async getPublicFileRedirectUrl(keys: string[]): Promise<string> {
    const key = keys.join('/');
    try {
      return await this.receiverService.getPresignedGigPhotoUrlByKey(key);
    } catch (e) {
      return this.rethrowPublicFileError('public/files', key, e);
    }
  }

  async writePublicFileProxy(keys: string[], res: Response): Promise<void> {
    const key = keys.join('/');

    let obj: GetObjectCommandOutput;
    try {
      obj = await this.receiverService.getGigPhotoObjectByKey(key);
    } catch (e) {
      return this.rethrowPublicFileError('public/files-proxy', key, e);
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
    const buf = await this.receiverService.readS3BodyToBuffer(body);
    res.end(buf);
  }
}
