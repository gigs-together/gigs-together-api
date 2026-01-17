import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRoot(): { ok: true; service: string } {
    return this.appService.getRoot();
  }

  @Get('health')
  getHealth(): { ok: true } {
    return this.appService.getHealth();
  }

  @Get('photos')
  getPhotos(): Promise<{ photos: string[]; error?: string }> {
    return this.appService.getPhotos();
  }

  /**
   * Public stable URL for images stored in the private bucket.
   *
   * - `/public/files/:key(*)` redirects (302) to a presigned GET URL
   *   so the browser downloads directly from the bucket (no service egress).
   * - Use when you want a stable, shareable URL that still keeps the bucket private.
   */
  @Get('public/files/*keys')
  async getPublicFileRedirect(
    @Param('keys') keys: string[],
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.appService.getPublicFileRedirectUrl(keys);
    res.redirect(302, url);
  }

  /**
   * Same as `/public/files/...` but proxies bytes through the service.
   * Useful for clients that don't like redirects (some bots / scrapers).
   */
  @Get('public/files-proxy/*keys')
  getPublicFileProxy(
    @Param('keys') keys: string[],
    @Res() res: Response,
  ): Promise<void> {
    return this.appService.writePublicFileProxy(keys, res);
  }
}
