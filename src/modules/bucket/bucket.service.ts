import { BadRequestException, Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class BucketService {
  constructor() {}

  private readonly s3 = new S3Client({
    // Cloudflare R2 uses region "auto" (AWS SDK still requires a value).
    region: (process.env.S3_REGION ?? 'auto').trim() || 'auto',
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

  async upload(input: {
    key: string;
    buffer: Buffer;
    filename: string;
    mimetype?: string;
  }): Promise<string> {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new BadRequestException('S3_BUCKET is not configured');
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.buffer,
      ContentType: input.mimetype ?? 'application/octet-stream',
    });

    await this.s3.send(command);

    // Store only the bucket key path (relative), e.g. "/<prefix>/<uuid>-file.jpg".
    return `/${input.key}`;
  }

  private encodeS3KeyForPath(key: string): string {
    // Keep "/" separators but encode each segment.
    return key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  getPublicFileUrl(bucketPath: string): string | undefined {
    const trimmed = bucketPath.trim();
    if (!trimmed) return undefined;

    const key = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    const publicBaseRaw = (process.env.S3_PUBLIC_BASE_URL ?? '').trim();
    if (!publicBaseRaw) return undefined;
    const publicBase = /^[a-z][a-z0-9+.-]*:\/\//i.test(publicBaseRaw)
      ? publicBaseRaw
      : `https://${publicBaseRaw}`;
    const encoded = this.encodeS3KeyForPath(key);
    return new URL(encoded, `${publicBase.replace(/\/$/, '')}/`).toString();
  }
}
