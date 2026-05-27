import {
  Controller,
  Get,
  Headers,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  Version,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessJwtAuthGuard } from '../auth/guards/access-jwt-auth.guard';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { AuthorizationService } from '../auth/authorization.service';
import { AdminService } from './admin.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import type { V1AdminDashboardResponseBody } from './types/requests/v1-admin-dashboard-response';

/**
 * Manual admin-list cache refresh (e.g. after DB migration).
 * Requires ADMIN_REVALIDATE_SECRET; if unset, POST returns 503 (TTL refresh still works without it).
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly authorizationService: AuthorizationService,
    private readonly configService: ConfigService,
  ) {}

  @Version('1')
  @Get('dashboard')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  getDashboard(): V1AdminDashboardResponseBody {
    return this.adminService.getDashboard();
  }

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
    await this.authorizationService.refreshAdminsCache();
    return { ok: true };
  }
}
