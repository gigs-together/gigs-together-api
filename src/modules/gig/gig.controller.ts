import { Controller, Get, Query, Version } from '@nestjs/common';
import { GigService } from './gig.service';
import {
  V1GigGetRequestQuery,
  V1GigGetResponseBody,
} from './types/requests/v1-gig-get-request';

@Controller('gig')
export class GigController {
  constructor(private readonly gigService: GigService) {}

  private getApiPublicBase(): string {
    const explicit =
      process.env.APP_PUBLIC_BASE_URL ?? process.env.PUBLIC_BASE_URL;
    const baseRaw = (explicit ?? '').trim();
    if (!baseRaw) return '';
    const base = /^[a-z][a-z0-9+.-]*:\/\//i.test(baseRaw)
      ? baseRaw
      : `https://${baseRaw}`;
    return base.replace(/\/$/, '');
  }

  private encodeS3KeyForPath(key: string): string {
    // Keep "/" separators but encode each segment.
    return key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  private toPublicFilesProxyUrlFromStoredPhotoUrl(
    value?: string,
  ): string | undefined {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return undefined;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    const base = this.getApiPublicBase();

    // Already a public proxy route (relative) -> optionally make absolute.
    if (trimmed.startsWith('/public/files-proxy/')) {
      return base ? new URL(trimmed, base).toString() : trimmed;
    }

    // Stored as S3 key path ("/gigs/...") -> convert to stable public proxy URL.
    const key = trimmed.startsWith('/gigs/')
      ? trimmed.slice(1)
      : trimmed.startsWith('gigs/')
        ? trimmed
        : undefined;
    if (!key) return trimmed;

    const encoded = this.encodeS3KeyForPath(key);
    const rel = `/public/files-proxy/${encoded}`;
    return base ? new URL(rel, base).toString() : rel;
  }

  @Version('1')
  @Get()
  async getGigsV1(
    @Query() query: V1GigGetRequestQuery,
  ): Promise<V1GigGetResponseBody> {
    const { page = 1, size = 10 } = query;

    const gigs = await this.gigService.getGigs({ page, size });

    return {
      gigs: gigs.map((gig) => ({
        title: gig.title,
        date: gig.date.toString(), // TODO
        location: gig.location,
        ticketsUrl: gig.ticketsUrl,
        status: gig.status,
        photo: gig.photo
          ? {
              tgFileId: gig.photo.tgFileId,
              url: this.toPublicFilesProxyUrlFromStoredPhotoUrl(gig.photo.url),
            }
          : undefined,
      })),
      // TODO
      isLastPage: true,
    };
  }
}
