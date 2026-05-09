import { Injectable } from '@nestjs/common';
import type {
  TGEditMessageCaption,
  TGEditMessageMedia,
  TGEditMessageText,
  TGMessage,
  TGSendPhoto,
  TGChatId,
} from './types/message.types';
import type { TGChat } from './types/chat.types';
import { GigDocument, GigPost, GigPoster } from '../gig/gig.schema';
import { Action } from './types/action.enum';
import { PostType } from '../gig/types/postType.enum';
import { Messenger } from '../gig/types/messenger.enum';
import type { TGInlineKeyboardMarkup } from './types/update.types';
import { TelegramGigPostEditKind } from './types/telegram-gig-post-edit-kind.enum';
import { BucketService } from '../bucket/bucket.service';

type TelegramGigPostEditComposition =
  | { kind: TelegramGigPostEditKind.Media; payload: TGEditMessageMedia }
  | { kind: TelegramGigPostEditKind.Caption; payload: TGEditMessageCaption }
  | { kind: TelegramGigPostEditKind.Text; payload: TGEditMessageText };

export interface PublishPayload {
  caption: string;
  message: Omit<TGSendPhoto, 'photo'>;
  gigId: string;
  photo?: string;
}

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

interface GetPosterPayload {
  post?: GigPost;
  poster?: GigPoster;
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
          kind: TelegramGigPostEditKind.Media,
          payload: {
            chatId,
            messageId,
            media: {
              type: 'photo',
              media: posterUrl,
              caption,
              parse_mode: 'HTML',
            },
            replyMarkup,
          },
        };
      }
    }

    if (post?.fileId) {
      return {
        kind: TelegramGigPostEditKind.Caption,
        payload: {
          chatId,
          messageId,
          caption,
          parseMode: 'HTML',
          disableWebPagePreview: true,
          replyMarkup,
        },
      };
    }

    return {
      kind: TelegramGigPostEditKind.Text,
      payload: {
        chatId,
        messageId,
        text: caption,
        parseMode: 'HTML',
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

    const caption = this.buildCaption({
      url,
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
          kind: TelegramGigPostEditKind.Media,
          payload: {
            chatId,
            messageId,
            media: {
              type: 'photo',
              media: posterUrl,
              caption,
              parse_mode: 'HTML',
            },
          },
        };
      }
    }

    if (post?.fileId) {
      return {
        kind: TelegramGigPostEditKind.Caption,
        payload: {
          chatId,
          messageId,
          caption,
          parseMode: 'HTML',
          disableWebPagePreview: true,
        },
      };
    }

    return {
      kind: TelegramGigPostEditKind.Text,
      payload: {
        chatId,
        messageId,
        text: caption,
        parseMode: 'HTML',
        disableWebPagePreview: true,
      },
    };
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

  private getPosterUrl(poster?: GigPoster): string | undefined {
    if (!poster) return;

    const { bucketPath, externalUrl } = poster;
    if (bucketPath) {
      return this.bucketService.getPublicFileUrl(bucketPath) ?? externalUrl;
    }
    return externalUrl;
  }

  private getPosterUrlOrFileId(payload: GetPosterPayload): string | undefined {
    const { post, poster } = payload;
    if (post?.fileId) {
      return post.fileId;
    }

    return this.getPosterUrl(poster);
  }

  composeMainPost(gig: GigDocument): PublishPayload {
    const chatId = process.env.MAIN_CHANNEL_ID;

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

    const caption = this.buildCaption({
      url,
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });

    const moderationPost = this.pickTgPost(gig.posts, PostType.Moderation);
    const poster = this.getPosterUrlOrFileId({
      post: moderationPost,
      poster: gig.poster,
    });

    return {
      caption,
      message: { chat_id: chatId },
      photo: poster,
      gigId: String(gig._id),
    };
  }

  composeModerationPost(gig: GigDocument): PublishPayload {
    const chatId = process.env.MODERATION_CHANNEL_ID;
    const replyMarkup = this.buildModerationPostReplyMarkup(gig);

    const caption = this.buildCaption({
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    });

    const poster = this.getPosterUrlOrFileId({ poster: gig.poster });

    return {
      caption,
      message: {
        chat_id: chatId,
        reply_markup: replyMarkup,
      },
      photo: poster,
      gigId: String(gig._id),
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
          editGigUrl
            ? {
                text: '✏️ Edit',
                url: editGigUrl,
              }
            : undefined,
          {
            text: '❌ Reject',
            callback_data: `${Action.Reject}:${gig._id}`,
          },
        ].filter(Boolean),
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
  ): PublishPayload {
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
    const poster = this.getPosterUrlOrFileId({
      post: moderationPost,
      poster: gig.poster,
    });

    // TODO: add some language like "You've submitted, blablabla..."
    return {
      caption,
      message: {
        chat_id: chatId,
        reply_markup: replyMarkup,
      },
      photo: poster,
      gigId: String(gig._id),
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
