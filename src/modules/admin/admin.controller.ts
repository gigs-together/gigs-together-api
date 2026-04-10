import {
  Controller,
  Headers,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';

/**
 * Manual admin-list cache refresh (e.g. after DB migration).
 * Requires ADMIN_REVALIDATE_SECRET; if unset, POST returns 503 (TTL refresh still works without it).
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly configService: ConfigService,
  ) {}

  @Post('revalidate')
  async revalidateAdmins(
    @Headers('x-admin-revalidate-secret') secretHeader: string | undefined,
  ): Promise<{ readonly ok: true }> {
    const secret = (
      this.configService.get<string>('ADMIN_REVALIDATE_SECRET') ?? ''
    ).trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'ADMIN_REVALIDATE_SECRET is not configured',
      );
    }
    const provided = (secretHeader ?? '').trim();
    if (!provided || provided !== secret) {
      throw new UnauthorizedException();
    }
    await this.adminService.refreshAdminsCache();
    return { ok: true };
  }
}
