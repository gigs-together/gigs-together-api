import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GigDocument } from '../gig/gig.schema';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import { BucketService } from '../bucket/bucket.service';
import {
  TelegramPostComposer,
  WEEKLY_DIGEST_EMPTY_CHANNEL_MESSAGE_EN,
  WeeklyDigestMainChannelSendKind,
} from './telegram-post-composer.service';
import { TELEGRAM_MEDIA_CAPTION_MAX_CHARS } from './telegram-bot.client';
import type { BuildGigPermalinkPayload } from './telegram-post-composer.service';

describe('TelegramPostComposer', () => {
  let composer: TelegramPostComposer;

  const mockBucket = {
    getPublicFileUrl: vi.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramPostComposer,
        { provide: BucketService, useValue: mockBucket },
      ],
    }).compile();

    composer = moduleRef.get(TelegramPostComposer);
  });

  describe('pickTgPost', () => {
    it('should return the Telegram post matching type when present', () => {
      const post = {
        to: Messenger.Telegram,
        type: PostType.Publish,
        id: 7,
        chatId: -1001 as const,
      };

      const result = composer.pickTgPost([post], PostType.Publish);

      expect(result).toBe(post);
    });

    it('should return undefined when posts array is missing matching Telegram post', () => {
      expect(composer.pickTgPost(undefined, PostType.Publish)).toBeUndefined();
    });
  });

  describe('getPostUrl', () => {
    it('should build public t.me URL when chatUsername is set', () => {
      const url = composer.getPostUrl({
        chatUsername: 'mychannel',
        messageId: 42,
      });

      expect(url).toBe('https://t.me/mychannel/42');
    });

    it('should build private supergroup URL when only numeric chatId is set', () => {
      const url = composer.getPostUrl({
        chatId: '-1001234567890',
        messageId: 5,
      });

      expect(url).toBe('https://t.me/c/1234567890/5');
    });
  });

  describe('buildGigPermalink', () => {
    it('should build feed URL with lowercased country and city and hash publicId', () => {
      const input: BuildGigPermalinkPayload = {
        baseUrl: 'https://app.example',
        country: 'ES',
        city: 'BCN',
        publicId: 'gig-1',
      };

      expect(composer.buildGigPermalink(input)).toBe(
        'https://app.example/feed/es/bcn#gig-1',
      );
    });
  });

  describe('buildCaption', () => {
    it('should include titled link when url is provided', () => {
      const caption = composer.buildCaption({
        url: 'https://app.example/feed/es/bcn#ab',
        title: 'Concert',
        ticketsUrl: 'https://tickets.example/x',
        venue: 'Hall',
        date: new Date('2026-06-01T12:00:00.000Z'),
      });

      expect(caption).toContain(
        '<a href="https://app.example/feed/es/bcn#ab">',
      );
      expect(caption).toContain('Concert</a>');
      expect(caption).toContain('📍 Hall');
      expect(caption).toContain('🎫 https://tickets.example/x');
    });
  });

  describe('composeWeeklyDigestMainChannelSendPlan', () => {
    it('should return empty-week sendMessage when gigs list is empty', () => {
      const plan = composer.composeWeeklyDigestMainChannelSendPlan({
        chatId: '-1001',
        gigs: [],
      });

      expect(plan).toEqual({
        kind: WeeklyDigestMainChannelSendKind.SendMessage,
        payload: {
          chat_id: '-1001',
          text: WEEKLY_DIGEST_EMPTY_CHANNEL_MESSAGE_EN,
        },
      });
    });

    it('should return sendMediaGroup with caption on first item when at least two posters resolve', () => {
      mockBucket.getPublicFileUrl.mockReturnValue('https://cdn.example/p.jpg');

      const gigs = [
        {
          _id: 'a',
          title: 'Alpha',
          date: 10,
          posts: [],
          poster: { bucketPath: 'gigs/a.jpg' },
        },
        {
          _id: 'b',
          title: 'Beta',
          date: 20,
          posts: [],
          poster: { bucketPath: 'gigs/b.jpg' },
        },
      ] as unknown as GigDocument[];

      const plan = composer.composeWeeklyDigestMainChannelSendPlan({
        chatId: '-1002',
        gigs,
      });

      expect(plan.kind).toBe(WeeklyDigestMainChannelSendKind.SendMediaGroup);
      if (plan.kind !== WeeklyDigestMainChannelSendKind.SendMediaGroup) return;

      expect(plan.payload.chat_id).toBe('-1002');
      expect(plan.payload.media).toHaveLength(2);
      expect(plan.payload.media[0]).toMatchObject({
        type: 'photo',
        media: 'https://cdn.example/p.jpg',
        caption: expect.stringMatching(/Alpha/s),
      });
      expect(plan.payload.media[1]).toEqual({
        type: 'photo',
        media: 'https://cdn.example/p.jpg',
      });
    });

    it('should return sendPhoto with digest fallback id when exactly one poster resolves', () => {
      mockBucket.getPublicFileUrl.mockReturnValue(
        'https://cdn.example/only.jpg',
      );

      const gigs = [
        {
          _id: 'a',
          title: 'Only',
          date: 10,
          posts: [],
          poster: { bucketPath: 'gigs/a.jpg' },
        },
      ] as unknown as GigDocument[];

      const plan = composer.composeWeeklyDigestMainChannelSendPlan({
        chatId: '-1003',
        gigs,
      });

      expect(plan).toEqual({
        kind: WeeklyDigestMainChannelSendKind.SendPhoto,
        payload: {
          chat_id: '-1003',
          photo: 'https://cdn.example/only.jpg',
          caption: expect.stringMatching(/Only/s),
        },
      });
    });

    it('should return caption as plain sendMessage when no posters resolve', () => {
      const gigs = [
        {
          _id: 'a',
          title: 'TextOnly',
          date: 86_400_000,
          posts: [],
        },
      ] as unknown as GigDocument[];

      const plan = composer.composeWeeklyDigestMainChannelSendPlan({
        chatId: '-1004',
        gigs,
      });

      expect(plan.kind).toBe(WeeklyDigestMainChannelSendKind.SendMessage);
      if (plan.kind !== WeeklyDigestMainChannelSendKind.SendMessage) return;

      expect(plan.payload.chat_id).toBe('-1004');
      expect(plan.payload.text).toContain('TextOnly');
    });
  });

  describe('formatWeeklyDigestCaptionLines', () => {
    it('should append ellipsis when caption exceeds maxChars', () => {
      const longTitle = 'X'.repeat(1100);
      const gigs = [
        { _id: '1', title: longTitle, date: 86_400_000, posts: [] },
      ] as unknown as GigDocument[];

      const text = composer.formatWeeklyDigestCaptionLines(gigs);

      expect(text.endsWith('\n…')).toBe(true);
      expect(text.length).toBeLessThanOrEqual(TELEGRAM_MEDIA_CAPTION_MAX_CHARS);
    });
  });
});
