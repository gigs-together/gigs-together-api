import { Injectable } from '@nestjs/common';
import type { V1AdminDashboardResponseBody } from './types/requests/v1-admin-dashboard-response';

@Injectable()
export class AdminService {
  getDashboard(): V1AdminDashboardResponseBody {
    return {
      summary: {
        pendingGigsCount: 0,
        publishedGigsCount: 0,
      },
    };
  }
}
