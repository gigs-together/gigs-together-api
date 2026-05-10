import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  TGEditMessageCaption,
  TGEditMessageMedia,
  TGEditMessageText,
  TGMessage,
  TGSendMediaGroup,
  TGSendMessage,
  TGSendPhoto,
  TGChatId,
  TGInputMedia,
} from './types/message.types';
import { TGInputMediaType, TGParseMode } from './types/message.types';
import type { TGChat } from './types/chat.types';
import { GigDocument, GigPost, GigPoster } from '../gig/gig.schema';
import { Action } from './types/action.enum';
import { PostType } from '../gig/types/postType.enum';
import { Messenger } from '../gig/types/messenger.enum';
import type { TGInlineKeyboardMarkup } from './types/update.types';
import { BucketService } from '../bucket/bucket.service';
import {
  TELEGRAM_MEDIA_CAPTION_MAX_CHARS,
  TELEGRAM_MEDIA_GROUP_MAX_ITEMS,
} from './telegram-bot.client';

export const WEEKLY_DIGEST_EMPTY_CHANNEL_MESSAGE_EN =
  'There are no gigs scheduled for this week.';

export enum PostEditKind {
  Media = 'media',
  Caption = 'caption',
  Text = 'text',
}

export enum WeeklyDigestMainChannelSendKind {
  SendMessage = 'sendMessage',
  SendPhoto = 'sendPhoto',
  SendMediaGroup = 'sendMediaGroup',
}

export interface ComposeWeeklyDigestMainChannelPlanParams {
  readonly chatId: TGChatId;
  readonly gigs: readonly GigDocument[];
}

export type WeeklyDigestMainChannelSendPlan =
  | {
      readonly kind: WeeklyDigestMainChannelSendKind.SendMessage;
      readonly payload: TGSendMessage;
    }
  | {
      readonly kind: WeeklyDigestMainChannelSendKind.SendPhoto;
      readonly payload: TGSendPhoto;
    }
  | {
      readonly kind: WeeklyDigestMainChannelSendKind.SendMediaGroup;
      readonly payload: TGSendMediaGroup;
    };

type TelegramGigPostEditComposition =
  | { kind: PostEditKind.Media; payload: TGEditMessageMedia }
  | { kind: PostEditKind.Caption; payload: TGEditMessageCaption }
  | { kind: PostEditKind.Text; payload: TGEditMessageText };

interface BuildCaptionPayload {
  date: string | number | Date;
  endDate?: string | number | Date;
  venue: string;
  title: string;
  ticketsUrl: string;
  url?: string;
}

export interface BuildGigPermalinkPayload {
  baseUrl: string;
  country: string;
  city: string;
  publicId: string;
}

export interface GetPostUrlPayload {
  chatId?: TGChatId;
  chatUsername?: TGChat['username'];
  messageId: TGMessage['message_id'];
}

/**
 * Composes Telegram Bot API payloads for gig-related channel/moderation posts
 * (captions, inline keyboards, permalink URLs, edit payloads).
 *
 * Does not call the Bot HTTP API — callers send via {@link TelegramBotClient}.
 */
@Injectable()
export class TelegramPostComposer {
  constructor(private readonly bucketService: BucketService) {}

  private addCacheBustToUrl(url: string, cacheBust: string): string {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}tgcb=${encodeURIComponent(cacheBust)}`;
  }

  private getPosterUrlForEdit(poster?: GigPoster): string | undefined {
    const url = this.getPosterUrl(poster);
    if (!url) return;
    // Poster URLs may stay stable (S3 key overwrite, CDN caching, etc). Telegram compares
    // the "media" string and may return 400 "message is not modified" if the URL is unchanged.
    // Cache-bust makes the URL string unique per edit.
    return this.addCacheBustToUrl(url, String(Date.now()));
  }

  composeModerationPostEdit(
    gig: GigDocument,
    opts?: { updateMedia?: boolean },
  ): TelegramGigPostEditComposition | undefined {
    const post = this.pickTgPost(gig.posts, PostType.Moderation);
    const chatId = post?.chatId;
    const messageId = post?.id;
    if (!chatId || !messageId) return undefined;

    const replyMarkup = this.buildModerationPostReplyMarkup(gig);

    const caption = this.buildCaption({
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });

    if (opts?.updateMedia && post?.fileId) {
      const posterUrl = this.getPosterUrlForEdit(gig.poster);
      if (posterUrl) {
        return {
          kind: PostEditKind.Media,
          payload: {
            chatId,
            messageId,
            media: {
              type: TGInputMediaType.Photo,
              media: posterUrl,
              caption,
              parse_mode: TGParseMode.HTML,
            },
            replyMarkup,
          },
        };
      }
    }

    if (post?.fileId) {
      return {
        kind: PostEditKind.Caption,
        payload: {
          chatId,
          messageId,
          caption,
          parseMode: TGParseMode.HTML,
          disableWebPagePreview: true,
          replyMarkup,
        },
      };
    }

    return {
      kind: PostEditKind.Text,
      payload: {
        chatId,
        messageId,
        text: caption,
        parseMode: TGParseMode.HTML,
        disableWebPagePreview: true,
        replyMarkup,
      },
    };
  }

  composeMainPostEdit(
    gig: GigDocument,
    opts?: { updateMedia?: boolean },
  ): TelegramGigPostEditComposition | undefined {
    const post = this.pickTgPost(gig.posts, PostType.Publish);
    const chatId = post?.chatId;
    const messageId = post?.id;
    if (!chatId || !messageId) return undefined;

    const caption = this.buildMainPostCaption(gig);

    if (opts?.updateMedia && post?.fileId) {
      const posterUrl = this.getPosterUrlForEdit(gig.poster);
      if (posterUrl) {
        return {
          kind: PostEditKind.Media,
          payload: {
            chatId,
            messageId,
            media: {
              type: TGInputMediaType.Photo,
              media: posterUrl,
              caption,
              parse_mode: TGParseMode.HTML,
            },
          },
        };
      }
    }

    if (post?.fileId) {
      return {
        kind: PostEditKind.Caption,
        payload: {
          chatId,
          messageId,
          caption,
          parseMode: TGParseMode.HTML,
          disableWebPagePreview: true,
        },
      };
    }

    return {
      kind: PostEditKind.Text,
      payload: {
        chatId,
        messageId,
        text: caption,
        parseMode: TGParseMode.HTML,
        disableWebPagePreview: true,
      },
    };
  }

  private buildMainPostCaption(gig: GigDocument): string {
    const appBaseUrl = (process.env.APP_BASE_URL ?? '').trim();
    const url =
      appBaseUrl && gig.publicId && gig.country && gig.city
        ? this.buildGigPermalink({
            baseUrl: appBaseUrl,
            publicId: gig.publicId,
            country: gig.country,
            city: gig.city,
          })
        : undefined;

    return this.buildCaption({
      url,
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });
  }

  buildCaption(payload: BuildCaptionPayload): string {
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short', // e.g., "Nov"
      day: '2-digit',
    });
    const date = dateFormatter.format(new Date(payload.date));
    const endDate = payload.endDate
      ? dateFormatter.format(new Date(payload.endDate))
      : undefined;
    const dates = [date, endDate].filter(Boolean).join(' - ');

    return [
      payload.url
        ? `<a href="${payload.url}">${payload.title}</a>`
        : payload.title,
      '',
      `🗓 ${dates}`,
      `📍 ${payload.venue}`,
      '',
      `🎫 ${payload.ticketsUrl}`,
    ].join('\n');
  }

  pickTgPost(
    posts: GigPost[] | undefined,
    type: PostType,
  ): GigPost | undefined {
    return posts?.find((post) => {
      return !!(
        post?.to === Messenger.Telegram &&
        post?.type === type &&
        post?.chatId &&
        post?.id
      );
    });
  }

  formatWeeklyDigestCaptionLines(gigs: readonly GigDocument[]): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const lines = gigs.map((g) => {
      const dateLabel = formatter.format(new Date(g.date));
      return `${g.title} — ${dateLabel}`;
    });

    let body = lines.join('\n');
    if (body.length <= TELEGRAM_MEDIA_CAPTION_MAX_CHARS) {
      return body;
    }

    const ellipsis = '\n…';
    const budget = TELEGRAM_MEDIA_CAPTION_MAX_CHARS - ellipsis.length;
    if (budget <= 0) {
      return '…'.slice(0, TELEGRAM_MEDIA_CAPTION_MAX_CHARS);
    }

    body = body.slice(0, budget);
    const lastBreak = body.lastIndexOf('\n');
    if (lastBreak > budget * 0.5) {
      body = body.slice(0, lastBreak);
    }
    return `${body.trimEnd()}${ellipsis}`;
  }

  /**
   * Builds the Bot API payload for publishing the weekly digest to the main channel
   * (empty-week notice, media album, single photo, or plain text).
   */
  composeWeeklyDigestMainChannelSendPlan(
    params: ComposeWeeklyDigestMainChannelPlanParams,
  ): WeeklyDigestMainChannelSendPlan {
    const { chatId, gigs } = params;

    if (gigs.length === 0) {
      return {
        kind: WeeklyDigestMainChannelSendKind.SendMessage,
        payload: {
          chat_id: chatId,
          text: WEEKLY_DIGEST_EMPTY_CHANNEL_MESSAGE_EN,
        },
      };
    }

    const caption = this.formatWeeklyDigestCaptionLines(gigs);

    const firstChunk = gigs.slice(0, TELEGRAM_MEDIA_GROUP_MAX_ITEMS);
    const posterRefs = firstChunk
      .map((gig) => this.getPosterReferenceForDigestAlbum(gig))
      .filter((ref): ref is string => ref !== undefined && ref !== '');

    if (posterRefs.length >= 2) {
      const media: TGInputMedia[] = posterRefs.map((mediaUrl, index) =>
        index === 0
          ? {
              type: TGInputMediaType.Photo,
              media: mediaUrl,
              caption,
            }
          : {
              type: TGInputMediaType.Photo,
              media: mediaUrl,
            },
      );

      return {
        kind: WeeklyDigestMainChannelSendKind.SendMediaGroup,
        payload: {
          chat_id: chatId,
          media,
        },
      };
    }

    if (posterRefs.length === 1) {
      return {
        kind: WeeklyDigestMainChannelSendKind.SendPhoto,
        payload: {
          chat_id: chatId,
          photo: posterRefs[0],
          caption,
        },
      };
    }

    return {
      kind: WeeklyDigestMainChannelSendKind.SendMessage,
      payload: {
        chat_id: chatId,
        text: caption,
      },
    };
  }

  getPosterReferenceForDigestAlbum(gig: GigDocument): string | undefined {
    const moderationPost = this.pickTgPost(gig.posts, PostType.Moderation);
    return moderationPost?.fileId ?? this.getPosterUrl(gig.poster);
  }

  private getPosterUrl(posterInfo?: GigPoster): string | undefined {
    if (!posterInfo) return;

    const { bucketPath, externalUrl } = posterInfo;
    if (bucketPath) {
      return this.bucketService.getPublicFileUrl(bucketPath) ?? externalUrl;
    }
    return externalUrl;
  }

  composeMainPost(gig: GigDocument): TGSendPhoto {
    const chatIdRaw = process.env.MAIN_CHANNEL_ID;
    const chatId =
      chatIdRaw !== undefined && chatIdRaw !== null
        ? String(chatIdRaw).trim()
        : '';

    if (!chatId) {
      throw new BadRequestException(
        'Cannot compose main channel post: MAIN_CHANNEL_ID is not configured.',
      );
    }

    const caption = this.buildMainPostCaption(gig);

    const moderationPost = this.pickTgPost(gig.posts, PostType.Moderation);
    const poster = moderationPost?.fileId ?? this.getPosterUrl(gig.poster);

    if (poster === undefined || poster === '') {
      throw new BadRequestException(
        'Cannot compose main channel post: gig has no poster (moderation file_id or poster URL).',
      );
    }

    return {
      chat_id: chatId,
      photo: poster,
      caption,
      parse_mode: TGParseMode.HTML,
    };
  }

  composeModerationPost(gig: GigDocument): TGSendPhoto {
    const chatIdRaw = process.env.MODERATION_CHANNEL_ID;
    const chatId =
      chatIdRaw !== undefined && chatIdRaw !== null
        ? String(chatIdRaw).trim()
        : '';

    if (!chatId) {
      throw new BadRequestException(
        'Cannot compose moderation channel post: MODERATION_CHANNEL_ID is not configured.',
      );
    }

    const replyMarkup = this.buildModerationPostReplyMarkup(gig);

    const caption = this.buildCaption({
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });

    const poster = this.getPosterUrl(gig.poster);

    if (poster === undefined || poster === '') {
      throw new BadRequestException(
        'Cannot compose moderation channel post: gig has no poster URL.',
      );
    }

    return {
      chat_id: chatId,
      photo: poster,
      caption,
      reply_markup: replyMarkup,
    };
  }

  private buildModerationPostReplyMarkup(
    gig: GigDocument,
  ): TGInlineKeyboardMarkup {
    const editGigUrl = this.buildEditGigUrl(gig.publicId);

    return {
      inline_keyboard: [
        [
          {
            text: '✅ Approve',
            callback_data: `${Action.Approve}:${gig._id}`,
          },
          ...(editGigUrl ? [{ text: '✏️ Edit', url: editGigUrl }] : []),
          {
            text: '❌ Reject',
            callback_data: `${Action.Reject}:${gig._id}`,
          },
        ],
      ],
    };
  }

  buildEditGigUrl(publicId?: string): string | undefined {
    const editGigBaseUrl = (process.env.EDIT_GIG_URL ?? '').trim();
    return editGigBaseUrl && publicId
      ? `${editGigBaseUrl}?startapp=${encodeURIComponent(String(publicId))}`
      : undefined;
  }

  composeSubmissionFeedbackPost(
    gig: GigDocument,
    chatId: TGChatId,
  ): TGSendPhoto {
    const statusForUser = 'Pending';

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: `⏳ ${statusForUser}`,
            callback_data: `${Action.Status}:${statusForUser}`,
          },
        ],
      ],
    };

    const caption = this.buildCaption({
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });

    const moderationPost = this.pickTgPost(gig.posts, PostType.Moderation);
    const poster = moderationPost?.fileId ?? this.getPosterUrl(gig.poster);

    if (poster === undefined || poster === '') {
      throw new BadRequestException(
        'Cannot compose submission feedback post: gig has no poster (moderation file_id or poster URL).',
      );
    }

    // TODO: add some language like "You've submitted, blablabla..."
    return {
      chat_id: chatId,
      photo: poster,
      caption,
      reply_markup: replyMarkup,
    };
  }

  buildGigPermalink(input: BuildGigPermalinkPayload): string {
    const country = (input.country ?? '').trim().toLowerCase();
    const city = (input.city ?? '').trim().toLowerCase();

    // Current frontend routes:
    // - /feed/[country]/[city]
    // - gig anchor: #<publicId>
    const u = new URL(
      `/feed/${encodeURIComponent(country)}/${encodeURIComponent(city)}`,
      input.baseUrl,
    );
    u.hash = input.publicId ?? '';
    return u.toString();
  }

  getPostUrl(payload: GetPostUrlPayload): string | undefined {
    const { chatUsername, messageId, chatId } = payload;
    if (!messageId) return;
    if (chatUsername) {
      return `https://t.me/${chatUsername}/${messageId}`;
    }
    if (chatId) {
      const rawChatId = String(chatId);
      const internalChatId = rawChatId.startsWith('-100')
        ? rawChatId.slice(4)
        : rawChatId;
      return `https://t.me/c/${internalChatId}/${messageId}`;
    }
  }
}
