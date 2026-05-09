import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  TGMessage,
  TGSendMessage,
  TGSendPhoto,
  TGChatId,
} from './types/message.types';
import { GigDocument, GigPost, GigPoster } from '../gig/gig.schema';
import type { TGAnswerCallbackQuery } from './types/update.types';
import { Action } from './types/action.enum';
import { TGChat } from './types/chat.types';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { BucketService } from '../bucket/bucket.service';
import { PostType } from '../gig/types/postType.enum';
import { Messenger } from '../gig/types/messenger.enum';
import { logError } from '../../shared/utils/logging';
import { TelegramBotClient } from './telegram-bot.client';
import { TelegramAuthService } from './telegram-auth.service';
import type { TelegramInitDataParseResult } from './telegram-auth.service';
import type { TelegramLoginWidgetValidationPayload } from './types/telegram-login-widget-validation-payload';

interface PublishPayload {
  caption: string;
  message: Omit<TGSendPhoto, 'photo'>;
  gigId: string;
  photo?: string;
}

interface GetPosterPayload {
  post?: GigPost;
  poster?: GigPoster;
}

interface BuildCaptionPayload {
  date: string | number | Date;
  endDate?: string | number | Date;
  venue: string;
  title: string;
  ticketsUrl: string;
  url?: string;
}

interface EditSubmissionFeedbackPayload {
  chatId: TGChatId;
  messageId: number;
  title: string;
  status: string;
  url?: string;
}

interface HandleAfterPublishPayload {
  suggestedBy: GigDocument['suggestedBy'];
  moderationPost: {
    chatId: TGChatId;
    messageId: TGMessage['message_id'];
  };
  publishPost: {
    chatId: TGChatId;
    username: TGChat['username'];
    messageId: TGMessage['message_id'];
  };
  title: string;
  publicId?: string;
}

interface GetPostUrlPayload {
  chatId?: TGChatId;
  chatUsername?: TGChat['username'];
  messageId: TGMessage['message_id'];
}

@Injectable()
export class TelegramService {
  constructor(
    private readonly bucketService: BucketService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private readonly telegramAuthService: TelegramAuthService,
    private readonly telegramBotClient: TelegramBotClient,
  ) {}

  private readonly logger = new Logger(TelegramService.name);

  private static readonly CHAT_ERROR_TTL_MS = 60_000 * 5;

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

  async send(
    payload: TGSendMessage | TGSendPhoto,
    gigId?: string,
  ): Promise<TGMessage | undefined> {
    return this.telegramBotClient.send(payload, gigId);
  }

  async sendMessage(payload: TGSendMessage): Promise<TGMessage> {
    return this.telegramBotClient.sendMessage(payload);
  }

  async answerCallbackQuery(payload: TGAnswerCallbackQuery): Promise<void> {
    return this.telegramBotClient.answerCallbackQuery(payload);
  }

  async editModerationPost(
    gig: GigDocument,
    opts?: { updateMedia?: boolean },
  ): Promise<TGMessage | undefined> {
    const post = this.pickTgPost(gig.posts, PostType.Moderation);
    const chatId = post?.chatId;
    const messageId = post?.id;
    if (!chatId || !messageId) return;

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
        return this.telegramBotClient.editMessageMedia({
          chatId,
          messageId,
          media: {
            type: 'photo',
            media: posterUrl,
            caption,
            parse_mode: 'HTML',
          },
          replyMarkup,
        });
      }
    }

    // Otherwise, update caption for photo messages, or text for text-only messages.
    if (post?.fileId) {
      return this.telegramBotClient.editMessageCaption({
        chatId,
        messageId,
        caption,
        parseMode: 'HTML',
        disableWebPagePreview: true,
        replyMarkup,
      });
    }

    return this.telegramBotClient.editMessageText({
      chatId,
      messageId,
      text: caption,
      parseMode: 'HTML',
      disableWebPagePreview: true,
      replyMarkup,
    });
  }

  /**
   * Updates an already published post in the main channel (caption/text).
   * Does nothing if the gig has no stored post reference.
   *
   * NOTE: Can optionally update the media (poster) via editMessageMedia.
   */
  async editMainPost(
    gig: GigDocument,
    opts?: { updateMedia?: boolean },
  ): Promise<TGMessage | undefined> {
    const post = this.pickTgPost(gig.posts, PostType.Publish);
    const chatId = post?.chatId;
    const messageId = post?.id;
    if (!chatId || !messageId) return;

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
        return this.telegramBotClient.editMessageMedia({
          chatId,
          messageId,
          media: {
            type: 'photo',
            media: posterUrl,
            caption,
            parse_mode: 'HTML',
          },
        });
      }
    }

    if (post?.fileId) {
      return this.telegramBotClient.editMessageCaption({
        chatId,
        messageId,
        caption,
        parseMode: 'HTML',
        disableWebPagePreview: true,
      });
    }

    return this.telegramBotClient.editMessageText({
      chatId,
      messageId,
      text: caption,
      parseMode: 'HTML',
      disableWebPagePreview: true,
    });
  }

  parseTelegramInitDataString(initData: string): TelegramInitDataParseResult {
    return this.telegramAuthService.parseTelegramInitDataString(initData);
  }

  validateTelegramInitData(
    dataCheckString: string,
    receivedHash: string,
  ): void {
    return this.telegramAuthService.validateTelegramInitData(
      dataCheckString,
      receivedHash,
    );
  }

  validateTelegramInitDataAuthDate(authDateRaw: string | undefined): void {
    return this.telegramAuthService.validateTelegramInitDataAuthDate(
      authDateRaw,
    );
  }

  validateTelegramLoginWidget(
    payload: TelegramLoginWidgetValidationPayload,
  ): void {
    return this.telegramAuthService.validateTelegramLoginWidget(payload);
  }

  validateTelegramLoginWidgetAuthDate(authDateSec: number): void {
    return this.telegramAuthService.validateTelegramLoginWidgetAuthDate(
      authDateSec,
    );
  }

  private buildCaption(payload: BuildCaptionPayload): string {
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

  private publish(payload: PublishPayload): Promise<TGMessage> {
    const { caption, message, photo, gigId } = payload;

    return this.telegramBotClient.send(
      {
        text: caption,
        caption,
        photo,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...message,
      },
      gigId,
    );
  }

  async publishWeeklyDigestToMainChannel(
    gigs: readonly GigDocument[],
  ): Promise<void> {
    // TODO
    void gigs;
  }

  publishMain(gig: GigDocument): Promise<TGMessage> {
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

    const buildCaptionPayload: BuildCaptionPayload = {
      url,
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    };

    const caption = this.buildCaption(buildCaptionPayload);
    const moderationPost = this.pickTgPost(gig.posts, PostType.Moderation);
    const poster = this.getPosterUrlOrFileId({
      post: moderationPost,
      poster: gig.poster,
    });

    return this.publish({
      caption,
      message: { chat_id: chatId },
      photo: poster,
      gigId: String(gig._id),
    });
  }

  async sendToModeration(gig: GigDocument): Promise<TGMessage> {
    const chatId = process.env.MODERATION_CHANNEL_ID;
    const replyMarkup = this.buildModerationPostReplyMarkup(gig);

    const buildCaptionPayload: BuildCaptionPayload = {
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    };

    const caption = this.buildCaption(buildCaptionPayload);
    const poster = this.getPosterUrlOrFileId({ poster: gig.poster });

    return this.publish({
      caption,
      message: {
        chat_id: chatId,
        reply_markup: replyMarkup,
      },
      photo: poster,
      gigId: String(gig._id),
    });
  }

  private buildModerationPostReplyMarkup(gig: GigDocument) {
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

  private buildEditGigUrl(publicId?: string): string | undefined {
    const editGigBaseUrl = (process.env.EDIT_GIG_URL ?? '').trim();
    return editGigBaseUrl && publicId
      ? `${editGigBaseUrl}?startapp=${encodeURIComponent(String(publicId))}`
      : undefined;
  }

  async handleAfterPublish(payload: HandleAfterPublishPayload) {
    const { suggestedBy, moderationPost, publishPost, title, publicId } =
      payload;
    const editGigUrl = publicId ? this.buildEditGigUrl(publicId) : undefined;

    const publishPostChatIdUrl = this.getPostUrl({
      messageId: publishPost.messageId,
      chatId: publishPost.chatId,
    });

    const replyButtons = [
      publishPostChatIdUrl
        ? {
            text: '🔗 Post',
            url: publishPostChatIdUrl,
          }
        : undefined,
      editGigUrl
        ? {
            text: '✏️ Edit',
            url: editGigUrl,
          }
        : undefined,
    ].filter(Boolean);

    const replyMarkup =
      replyButtons.length > 0
        ? {
            inline_keyboard: [replyButtons],
          }
        : undefined;

    // Clean moderation post content & keep only Edit button.
    // NOTE: Telegram can't remove media from a photo message via edit APIs,
    // so the poster will remain, but the caption/text will be cleaned.
    await this.telegramBotClient.editMessageCaption({
      chatId: moderationPost.chatId,
      messageId: moderationPost.messageId,
      caption: title,
      parseMode: 'HTML',
      disableWebPagePreview: true,
      replyMarkup,
    });

    const publishPostUsernameUrl = this.getPostUrl({
      chatUsername: publishPost.username,
      messageId: publishPost.messageId,
    });

    await this.editSubmissionFeedback({
      chatId: suggestedBy.userId,
      messageId: suggestedBy.feedbackMessageId,
      title,
      status: 'Published',
      url: publishPostUsernameUrl,
    });
  }

  async handlePostReject({ suggestedBy, moderationMessage, gigId, title }) {
    await this.telegramBotClient.editMessageReplyMarkup({
      chatId: moderationMessage.chatId,
      messageId: moderationMessage.messageId,
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: '❌ Rejected',
              callback_data: `${Action.Rejected}:${gigId}`,
            },
          ],
        ],
        // TODO: reason for rejection
        // force_reply: true,
        // input_field_placeholder: 'Reason?',
      },
    });

    await this.editSubmissionFeedback({
      chatId: suggestedBy.userId,
      messageId: suggestedBy.feedbackMessageId,
      title,
      status: 'Rejected',
    });
  }

  private editSubmissionFeedback(
    payload: EditSubmissionFeedbackPayload,
  ): Promise<TGMessage> {
    const { chatId, messageId, title, status, url } = payload;
    if (!chatId || !messageId) return;

    return this.telegramBotClient.editMessageCaption({
      chatId,
      messageId,
      caption: `${title} is ${status}`,
      replyMarkup: url
        ? {
            inline_keyboard: [
              [
                {
                  text: '🔗 Post',
                  url,
                },
              ],
            ],
          }
        : undefined,
    });
  }

  async sendSubmissionFeedback(
    gig: GigDocument,
    chatId: TGChatId,
  ): Promise<TGMessage> {
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

    const buildCaptionPayload: BuildCaptionPayload = {
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      date: gig.date,
      endDate: gig.endDate,
    };

    const caption = this.buildCaption(buildCaptionPayload);
    const moderationPost = this.pickTgPost(gig.posts, PostType.Moderation);
    const poster = this.getPosterUrlOrFileId({
      post: moderationPost,
      poster: gig.poster,
    });

    // TODO: add some language like "You've submitted, blablabla..."
    return this.publish({
      caption,
      message: {
        chat_id: chatId,
        reply_markup: replyMarkup,
      },
      photo: poster,
      gigId: String(gig._id),
    });
  }

  public async getChatUsername(
    chatId: TGChat['id'],
  ): Promise<TGChat['username']> {
    const chatKey = `chat:${chatId}`;
    const errorKey = `chat-error:${chatId}`;

    const cachedChat = await this.cache.get<TGChat>(chatKey);
    if (cachedChat) return cachedChat.username;

    const cachedError = await this.cache.get<boolean>(errorKey);
    if (cachedError) return undefined;

    try {
      const chat = await this.telegramBotClient.getChat(chatId);
      await this.cache.set(chatKey, chat);
      return chat.username;
    } catch (e: unknown) {
      logError(this.logger, {
        error: e,
        note: 'Error getting chat username',
        context: TelegramService.name,
        meta: { chatId },
      });
      await this.cache.set(errorKey, true, TelegramService.CHAT_ERROR_TTL_MS);
      return undefined;
    }
  }

  private buildGigPermalink(input: {
    baseUrl: string;
    country: string;
    city: string;
    publicId: string;
  }): string {
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
