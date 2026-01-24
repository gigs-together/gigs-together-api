import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GetObjectCommand,
  GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { getGigPostersPrefix, isGigPosterKey } from './gig-posters';

@Injectable()
export class BucketService {
  constructor() {}

  private readonly logger = new Logger(BucketService.name);

  private readonly s3 = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    // Boolean("false") === true — so parse explicitly
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE) === 'true',
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  private rethrowBucketError(route: string, key: string, e: any): never {
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

  private isS3NotFoundError(e: any): boolean {
    const name = e?.name;
    const code = e?.Code ?? e?.code;
    const status = e?.$metadata?.httpStatusCode;
    const message = String(e?.message ?? '');
    return (
      name === 'NoSuchKey' ||
      code === 'NoSuchKey' ||
      status === 404 ||
      /nosuchkey/i.test(message)
    );
  }

  async uploadGigPoster(input: {
    buffer: Buffer;
    filename: string;
    mimetype?: string;
  }): Promise<string> {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION;
    if (!bucket || !region) {
      throw new BadRequestException('S3_BUCKET or S3_REGION is not configured');
    }
    const key = `${getGigPostersPrefix()}/${randomUUID()}-${input.filename}`;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.buffer,
      ContentType: input.mimetype ?? 'application/octet-stream',
    });
    await this.s3.send(command);

    // Store only the bucket key path (relative), e.g. "/<prefix>/<uuid>-file.jpg".
    return `/${key}`;
  }

  private normalizePresignExpiresIn(expiresIn: number): number {
    // AWS SigV4 presign supports up to 7 days for many services; keep it sane.
    if (!Number.isFinite(expiresIn)) return 3600;
    if (expiresIn < 60) return 60;
    if (expiresIn > 604800) return 604800;
    return Math.floor(expiresIn);
  }

  private ensureGigPosterKey(key: string): string {
    const trimmed = key?.trim?.() ?? key;
    if (!trimmed) {
      throw new BadRequestException('key is required');
    }
    // Avoid exposing arbitrary objects; homepage uses only the configured prefix.
    if (!isGigPosterKey(trimmed)) {
      throw new NotFoundException();
    }
    // Hardening: avoid weird traversal-ish keys.
    if (trimmed.includes('..')) {
      throw new NotFoundException();
    }
    return trimmed;
  }

  private async presignGetObjectUrl(input: {
    bucket: string;
    key: string;
    expiresIn: number;
  }): Promise<string> {
    const { bucket, key, expiresIn } = input;
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    // Use the official AWS SDK v3 presigner so endpoint + path-style/virtual-host
    // are handled correctly for S3-compatible providers like Railway Buckets.
    return await getSignedUrl(this.s3, command, { expiresIn });
  }

  async getPresignedGigPosterUrlByKey(key: string): Promise<string> {
    const safeKey = this.ensureGigPosterKey(key);
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION;
    if (!bucket || !region) {
      throw new BadRequestException('S3_BUCKET or S3_REGION is not configured');
    }
    const expiresIn = this.normalizePresignExpiresIn(
      Number(process.env.S3_PRESIGN_EXPIRES_IN ?? 3600),
    );
    try {
      return await this.presignGetObjectUrl({
        bucket,
        key: safeKey,
        expiresIn,
      });
    } catch (e) {
      return this.rethrowBucketError('public/files', safeKey, e);
    }
  }

  async tryGetGigPosterObjectByKey(
    key: string,
  ): Promise<GetObjectCommandOutput | null> {
    const safeKey = this.ensureGigPosterKey(key);
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new BadRequestException('S3_BUCKET is not configured');
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: safeKey,
    });
    try {
      return await this.s3.send(command);
    } catch (e) {
      if (this.isS3NotFoundError(e)) return null;
      return this.rethrowBucketError('public/files-proxy', safeKey, e);
    }
  }

  async readS3BodyToBuffer(body: any): Promise<Buffer> {
    if (!body) return Buffer.alloc(0);
    if (Buffer.isBuffer(body)) return body;
    if (typeof body?.transformToByteArray === 'function') {
      const arr = await body.transformToByteArray();
      return Buffer.from(arr);
    }
    if (typeof body?.arrayBuffer === 'function') {
      const ab = await body.arrayBuffer();
      return Buffer.from(ab);
    }
    // Node Readable
    if (typeof body?.on === 'function') {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        body.on('data', (chunk: Buffer) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        body.on('end', () => resolve());
        body.on('error', (e: any) => reject(e));
      });
      return Buffer.concat(chunks);
    }
    return Buffer.from(String(body));
  }
}
