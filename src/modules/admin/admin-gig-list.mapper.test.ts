import { Types } from 'mongoose';

import { mapGigToAdminListItem } from './admin-gig-list.mapper';
import type { GigDocument } from '../gig/gig.schema';
import { Status } from '../gig/types/status.enum';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';

function buildGigDoc(overrides: Partial<GigDocument> = {}): GigDocument {
  const id = new Types.ObjectId('507f1f77bcf86cd799439011');
  return {
    _id: id,
    publicId: 'radiohead-barcelona-2026-06-12',
    title: 'Radiohead',
    date: new Date('2026-06-12T12:00:00.000Z').getTime(),
    city: 'barcelona',
    country: 'ES',
    venue: 'Palau Sant Jordi',
    ticketsUrl: 'https://example.com/tickets',
    status: Status.Pending,
    posts: [
      {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        chatId: -100123,
        id: 42,
      },
    ],
    suggestedBy: { userId: 9001 },
    ...overrides,
  } as GigDocument;
}

describe('mapGigToAdminListItem', () => {
  it('should map gig document fields for admin list response', () => {
    const gig = buildGigDoc();

    expect(
      mapGigToAdminListItem({
        gig,
        posterUrl: 'https://cdn.example/poster.jpg',
        postUrl: 'https://t.me/channel/1',
      }),
    ).toEqual({
      id: String(gig._id),
      publicId: 'radiohead-barcelona-2026-06-12',
      title: 'Radiohead',
      status: Status.Pending,
      date: '2026-06-12',
      city: 'barcelona',
      countryCode: 'ES',
      venue: 'Palau Sant Jordi',
      posterUrl: 'https://cdn.example/poster.jpg',
      suggestedBy: { userId: '9001' },
      ticketsUrl: 'https://example.com/tickets',
      postUrl: 'https://t.me/channel/1',
      hasTelegramModerationPost: true,
    });
  });

  it('should omit empty ticketsUrl', () => {
    const gig = buildGigDoc({ ticketsUrl: '   ' });

    expect(mapGigToAdminListItem({ gig }).ticketsUrl).toBeUndefined();
  });
});
