import { Injectable } from '@nestjs/common';
import { mapGigToAdminListItem } from './admin-gig-list.mapper';
import { GigService } from '../gig/gig.service';
import { Status } from '../gig/types/status.enum';
import type { V1AdminDashboardResponseBody } from './types/requests/v1-admin-dashboard-response';
import type {
  AdminGigListStatusQuery,
  V1AdminGigsGetQueryDto,
} from './types/requests/v1-admin-gigs-get-query';
import type {
  V1AdminGigListItem,
  V1AdminGigsListResponseBody,
} from './types/requests/v1-admin-gigs-list-response';

const STATUS_BY_QUERY: Record<AdminGigListStatusQuery, Status> = {
  pending: Status.Pending,
  published: Status.Published,
  rejected: Status.Rejected,
};

@Injectable()
export class AdminService {
  constructor(private readonly gigService: GigService) {}

  async getGigsList(
    query: V1AdminGigsGetQueryDto,
  ): Promise<V1AdminGigsListResponseBody> {
    const status = STATUS_BY_QUERY[query.status];
    const docs = await this.gigService.getGigsByStatus({
      status,
      limit: query.limit,
    });

    const gigs: V1AdminGigListItem[] = [];
    for (const doc of docs) {
      const posterUrl = this.gigService.resolveGigPosterPublicUrl(doc.poster);
      const postUrl = await this.gigService.resolvePublishedPostUrl(doc.posts);
      gigs.push(
        mapGigToAdminListItem({
          gig: doc,
          posterUrl,
          postUrl,
        }),
      );
    }

    return { gigs };
  }

  async getDashboard(): Promise<V1AdminDashboardResponseBody> {
    const [pendingGigsCount, publishedGigsCount] = await Promise.all([
      this.gigService.getGigCountByStatus(Status.Pending),
      this.gigService.getGigCountByStatus(Status.Published),
    ]);

    return {
      summary: {
        pendingGigsCount,
        publishedGigsCount,
      },
    };
  }
}
