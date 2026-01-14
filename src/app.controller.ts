import {
  Controller,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ReceiverService } from './modules/receiver/receiver.service';
import type { Response } from 'express';

@Controller()
export class AppController {
  constructor(private readonly receiverService: ReceiverService) {}

  private readonly logger = new Logger(AppController.name);

  private rethrowPublicFileError(
    route: string,
    key: string,
    e: unknown,
  ): never {
    const name = (e as any)?.name;
    const code = (e as any)?.Code ?? (e as any)?.code;
    const status = (e as any)?.$metadata?.httpStatusCode;
    const message = String((e as any)?.message ?? '');

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
      (e as any)?.stack,
    );
    throw new InternalServerErrorException(
      `Internal server error (ref: ${errorId})`,
    );
  }

  @Get()
  async getHello(): Promise<string> {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Gigs Together</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 16px; background: #f7f7f7; }
    h1 { margin: 0 0 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .item { background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .item img { width: 100%; height: 200px; object-fit: cover; border-radius: 6px; }
    .caption { font-size: 12px; color: #555; margin-top: 6px; word-break: break-all; }
    .muted { color: #666; }
    .error { color: #b00020; }
  </style>
</head>
<body>
  <h1>Gigs Together</h1>
  <p id="status" class="muted">Loading…</p>
  <div id="grid" class="grid"></div>
  <script>
    (async function () {
      const statusEl = document.getElementById('status');
      const gridEl = document.getElementById('grid');
      function setStatus(text, cls) {
        statusEl.textContent = text;
        statusEl.className = cls || 'muted';
      }
      try {
        const res = await fetch('/photos', { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const photos = (data && data.photos) || [];
        if (data && data.error) {
          setStatus('Failed to load photos: ' + data.error, 'error');
          return;
        }
        if (!photos.length) {
          setStatus('No photos found.', 'muted');
          return;
        }
        setStatus('Loaded ' + photos.length + ' photos.', 'muted');
        gridEl.innerHTML = photos.map(function (url) {
          return '<div class="item">' +
            '<img src="' + url + '" loading="lazy" />' +
          '</div>';
        }).join('');
      } catch (e) {
        setStatus('Failed to load photos.', 'error');
      }
    })();
  </script>
</body>
</html>`;
  }

  @Get('photos')
  async getPhotos(): Promise<{ photos: string[]; error?: string }> {
    try {
      const photos = await this.receiverService.listGigPhotos();
      return { photos };
    } catch (e) {
      // Should be rare (ReceiverService already tries hard to not throw),
      // but keep the endpoint stable.
      return {
        photos: [],
        error: (e as any)?.message ?? 'Failed to load photos',
      };
    }
  }

  /**
   * Public stable URL for images stored in the private bucket.
   *
   * - `/public/files/:key(*)` redirects (302) to a presigned GET URL
   *   so the browser downloads directly from the bucket (no service egress).
   * - Use when you want a stable, shareable URL that still keeps the bucket private.
   */
  @Get('public/files/*key')
  async getPublicFileRedirect(
    @Param('key') key: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const url = await this.receiverService.getPresignedGigPhotoUrlByKey(key);
      res.redirect(302, url);
    } catch (e) {
      return this.rethrowPublicFileError('public/files', key, e);
    }
  }

  /**
   * Same as `/public/files/...` but proxies bytes through the service.
   * Useful for clients that don't like redirects (some bots / scrapers).
   */
  @Get('public/files-proxy/*key')
  async getPublicFileProxy(
    @Param('key') keys: string[],
    @Res() res: Response,
  ): Promise<void> {
    let obj: any;
    const key = keys.join('/');
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
    const body: any = obj.Body as any;
    if (typeof body?.pipe === 'function') {
      body.pipe(res);
      return;
    }

    // Fallback for non-stream bodies.
    const buf = await this.receiverService.readS3BodyToBuffer(body);
    res.end(buf);
  }
}
