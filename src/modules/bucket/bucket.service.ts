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
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  PutObjectCommand,
  S3Client,
  _Object,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import {
  getGigPhotosPrefix,
  getGigPhotosPrefixWithSlash,
  isGigPhotoKey,
} from './gig-photos';

@Injectable()
export class BucketService {
  constructor() {}

  private readonly logger = new Logger(BucketService.name);

  // Used by /photos endpoint (homepage gallery)
  private readonly photosCacheTtlMs = 60_000;
  private photosCache?: { at: number; value: string[] };
  private photosInFlight?: Promise<string[]>;
  private lastListPhotosErrorLogAt?: number;

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

  async uploadGigPhoto(input: {
    buffer: Buffer;
    filename: string;
    mimetype?: string;
  }): Promise<string> {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION;
    if (!bucket || !region) {
      throw new BadRequestException('S3_BUCKET or S3_REGION is not configured');
    }
    const key = `${getGigPhotosPrefix()}/${randomUUID()}-${input.filename}`;
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

  async listGigPhotos(): Promise<string[]> {
    const now = Date.now();
    if (this.photosCache && now - this.photosCache.at < this.photosCacheTtlMs) {
      return this.photosCache.value;
    }
    if (this.photosInFlight) {
      return this.photosInFlight;
    }

    this.photosInFlight = this.listGigPhotosUncached()
      .then((value) => {
        this.photosCache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        this.photosInFlight = undefined;
      });

    return this.photosInFlight;
  }

  private async listGigPhotosUncached(): Promise<string[]> {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION;
    if (!bucket || !region) {
      throw new BadRequestException('S3_BUCKET or S3_REGION is not configured');
    }

    const listTimeoutMs = Number(process.env.S3_LIST_TIMEOUT_MS ?? 5_000);
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: getGigPhotosPrefixWithSlash(),
      // Avoid giant listings; this endpoint is for the homepage gallery.
      MaxKeys: 200,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), listTimeoutMs);
    let res: ListObjectsV2CommandOutput;
    try {
      res = await this.s3.send(command, {
        abortSignal: controller.signal,
      });
    } catch (e) {
      // Never crash the homepage on S3 issues; return cache (even stale) or empty.
      const now = Date.now();
      if (
        !this.lastListPhotosErrorLogAt ||
        now - this.lastListPhotosErrorLogAt > 60_000
      ) {
        this.lastListPhotosErrorLogAt = now;
        this.logger.warn(
          `listGigPhotos failed: ${JSON.stringify(e?.name ?? e?.message ?? e)}`,
        );
      }
      return this.photosCache?.value ?? [];
    } finally {
      clearTimeout(timeout);
    }

    const keys =
      res?.Contents?.map((o: _Object) => o.Key)
        .filter((k): k is string => Boolean(k))
        .filter((k) => !k.endsWith('/')) ?? [];

    // Return stable public URLs on our API. The browser will follow the 302 redirect
    // to a presigned URL, keeping the bucket private while avoiding proxying bytes.
    return keys.map((Key) => this.getPublicFileRedirectUrl(Key));
  }

  private normalizePresignExpiresIn(expiresIn: number): number {
    // AWS SigV4 presign supports up to 7 days for many services; keep it sane.
    if (!Number.isFinite(expiresIn)) return 3600;
    if (expiresIn < 60) return 60;
    if (expiresIn > 604800) return 604800;
    return Math.floor(expiresIn);
  }

  private encodeS3KeyForPath(key: string): string {
    // Keep "/" separators but encode each segment.
    return key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  private ensureGigPhotoKey(key: string): string {
    const trimmed = key?.trim?.() ?? key;
    if (!trimmed) {
      throw new BadRequestException('key is required');
    }
    // Avoid exposing arbitrary objects; homepage uses only the configured prefix.
    if (!isGigPhotoKey(trimmed)) {
      throw new NotFoundException();
    }
    // Hardening: avoid weird traversal-ish keys.
    if (trimmed.includes('..')) {
      throw new NotFoundException();
    }
    return trimmed;
  }

  private getApiPublicBase(): string {
    const explicit =
      process.env.APP_PUBLIC_BASE_URL ?? process.env.PUBLIC_BASE_URL;
    if (explicit) return explicit.replace(/\/$/, '');
    // Fallback: relative URLs still work for same-origin clients.
    return '';
  }

  private getPublicFileRedirectUrl(key: string): string {
    const safeKey = this.ensureGigPhotoKey(key);
    const base = this.getApiPublicBase();
    const encoded = this.encodeS3KeyForPath(safeKey);
    return `${base}/public/files/${encoded}`;
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

  async getPresignedGigPhotoUrlByKey(key: string): Promise<string> {
    const safeKey = this.ensureGigPhotoKey(key);
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

  getGigPhotoObjectByKey(key: string): Promise<GetObjectCommandOutput> {
    const safeKey = this.ensureGigPhotoKey(key);
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new BadRequestException('S3_BUCKET is not configured');
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: safeKey,
    });
    return this.s3
      .send(command)
      .catch((e) => this.rethrowBucketError('public/files-proxy', safeKey, e));
  }

  async tryGetGigPhotoObjectByKey(
    key: string,
  ): Promise<GetObjectCommandOutput | null> {
    const safeKey = this.ensureGigPhotoKey(key);
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
