import type { GigDocument } from '../gig/gig.schema';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import type { V1AdminGigListItem } from './types/requests/v1-admin-gigs-list-response';
import { msToYmd } from '../../shared/utils/date-formatter';

function hasTelegramModerationPost(gig: GigDocument): boolean {
  return (
    gig.posts?.some(
      (post) =>
        post.to === Messenger.Telegram &&
        post.type === PostType.Moderation &&
        post.chatId != null &&
        post.id != null,
    ) ?? false
  );
}

export interface MapGigToAdminListItemParams {
  readonly gig: GigDocument;
  readonly posterUrl?: string;
  readonly postUrl?: string;
}

export function mapGigToAdminListItem(
  params: MapGigToAdminListItemParams,
): V1AdminGigListItem {
  const { gig, posterUrl, postUrl } = params;

  const date = msToYmd(gig.date);
  if (!date) {
    throw new Error(`Gig ${String(gig._id)} is missing a valid event date`);
  }

  const ticketsUrl = (gig.ticketsUrl ?? '').trim();

  return {
    id: String(gig._id),
    publicId: gig.publicId,
    title: gig.title,
    status: gig.status,
    date,
    endDate: msToYmd(gig.endDate),
    city: gig.city,
    countryCode: gig.country,
    venue: gig.venue,
    posterUrl,
    suggestedBy: {
      userId: gig.suggestedBy.userId.toString(),
      username: gig.suggestedBy.username,
      name: gig.suggestedBy.name,
    },
    ticketsUrl: ticketsUrl.length > 0 ? ticketsUrl : undefined,
    postUrl,
    hasTelegramModerationPost: hasTelegramModerationPost(gig),
  };
}
