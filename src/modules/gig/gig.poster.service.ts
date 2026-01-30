import { BadRequestException, Injectable } from '@nestjs/common';
import { getGigPostersPrefixWithSlash } from '../bucket/gig-posters';
import { Gig, GigPoster } from './gig.schema';
import { firstValueFrom } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BucketService } from '../bucket/bucket.service';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class GigPosterService {
  constructor(
    @InjectModel(Gig.name) private gigModel: Model<Gig>,
    private readonly bucketService: BucketService,
    private readonly httpService: HttpService,
  ) {}

  toStoredGigPosterPath(value: string): string {
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
      const existing = await this.gigModel.findOne({
        'poster.externalUrl': url,
      });
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
