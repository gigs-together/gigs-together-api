import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  InputFile,
  TGEditMessageCaption,
  TGEditMessageMedia,
  TGEditMessageReplyMarkup,
  TGEditMessageText,
  TGMessage,
  TGSendMessage,
  TGSendPhoto,
  TGChatId,
} from './types/message.types';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { GigDocument, GigPost, GigPoster } from '../gig/gig.schema';
import type { TGAnswerCallbackQuery } from './types/update.types';
import FormData from 'form-data';
import { Action } from './types/action.enum';
import { TGChat } from './types/chat.types';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { BucketService } from '../bucket/bucket.service';
import { PostType } from '../gig/types/postType.enum';
import { Messenger } from '../gig/types/messenger.enum';

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

interface HandlePostPublishPayload {
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

interface GetPostLinkPayload {
  chatId?: TGChatId;
  chatUsername?: TGChat['username'];
  messageId: TGMessage['message_id'];
}

@Injectable()
export class TelegramService {
  constructor(
    private readonly httpService: HttpService,
    private readonly bucketService: BucketService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  private readonly logger = new Logger(TelegramService.name);

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
    try {
      if (this.isPhotoPayload(payload)) {
        return this.sendPhoto(payload, gigId);
      }
      return this.sendMessage(payload);
    } catch (e) {
      this.logger.error(
        `send error: ${JSON.stringify(e?.response?.data ?? e)}`,
        e instanceof Error ? e.stack : undefined,
      );
    }
  }

  async sendMessage(payload: TGSendMessage): Promise<TGMessage> {
    const res$ = this.httpService.post('sendMessage', payload);
    const res = await firstValueFrom(res$);
    return res.data.result;
  }

  private async sendPhoto(
    payload: TGSendPhoto,
    gigId?: string,
  ): Promise<TGMessage | undefined> {
    if (!payload) {
      throw new Error('No payload in sendPhoto');
    }
    const { photo, reply_markup, ...rest } = payload;
    if (this.isPhotoString(photo)) {
      try {
        const res$ = this.httpService.post('sendPhoto', payload);
        const res = await firstValueFrom(res$);
        return res.data.result;
      } catch (e) {
        // Telegram can't fetch the file from provided URL (often HTML/redirect/webp/etc).
        if (this.isWrongWebPageContentError(e) && this.isHttpUrl(photo)) {
          const downloaded = await this.downloadRemoteFileAsInputFile(
            photo,
            gigId,
          );
          if (downloaded) {
            return this.sendPhoto({ ...payload, photo: downloaded }, gigId);
          }

          // Last resort: send text-only message so publish doesn't silently fail.
          const text =
            payload.caption ??
            (payload as unknown as { text?: string }).text ??
            photo;
          return this.sendMessage({ chat_id: payload.chat_id, text });
        }
        throw e;
      }
    }

    // Buffer/Stream — multipart/form-data
    const form = new FormData();
    // form.append('chat_id', String(payload.chat_id));
    if (reply_markup) form.append('reply_markup', JSON.stringify(reply_markup));

    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null) form.append(k, String(v));
    }

    // TODO: jpg ?
    const filename = `poster${gigId}.jpg`;
    if (Buffer.isBuffer(photo)) {
      form.append('photo', photo, { filename });
    } else if (typeof photo.buffer !== 'undefined') {
      form.append('photo', photo.buffer, {
        filename: photo.filename,
        contentType: photo.contentType,
      });
    } else {
      form.append('photo', photo, { filename });
    }

    const res$ = this.httpService.post('sendPhoto', form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const res = await firstValueFrom(res$);
    return res.data.result;
  }

  private isPhotoPayload(
    payload: TGSendPhoto | TGSendMessage,
  ): payload is TGSendPhoto {
    return 'photo' in payload && !!payload.photo;
  }

  private isPhotoString(photo: string | InputFile): photo is string {
    return typeof photo === 'string';
  }

  private isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private isWrongWebPageContentError(e: any): boolean {
    const data = e?.response?.data;
    const description: string | undefined = data?.description;
    const errorCode: number | undefined = data?.error_code;
    return (
      errorCode === 400 &&
      typeof description === 'string' &&
      /wrong type of the web page content/i.test(description)
    );
  }

  private async downloadRemoteFileAsInputFile(
    url: string,
    gigId?: string,
  ): Promise<InputFile | undefined> {
    try {
      const res$ = this.httpService.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
      });
      const res = await firstValueFrom(res$);

      const contentType = (res.headers?.['content-type'] ??
        res.headers?.['Content-Type']) as string | undefined;

      // If it's clearly not an image, don't try to upload it as a photo.
      if (contentType && !contentType.toLowerCase().startsWith('image/')) {
        this.logger.warn(
          `downloadRemoteFileAsInputFile: non-image content-type (${contentType}) for ${url}`,
        );
        return;
      }

      const buffer = Buffer.from(res.data);
      // TODO: ??
      const filename =
        this.guessFilenameFromUrl(url) ?? `poster${gigId ?? ''}.jpg`;

      return { buffer, filename, contentType };
    } catch (e) {
      this.logger.warn(
        `downloadRemoteFileAsInputFile error: ${JSON.stringify(
          e?.response?.data ?? e,
        )}`,
      );
      return;
    }
  }

  private guessFilenameFromUrl(url: string): string | undefined {
    try {
      const u = new URL(url);
      const last = u.pathname.split('/').filter(Boolean).pop();
      if (!last) return;
      // Avoid super-long filenames / query-ish blobs.
      return last.length > 200 ? undefined : last;
    } catch {
      return;
    }
  }

  async answerCallbackQuery(payload: TGAnswerCallbackQuery): Promise<void> {
    const { callback_query_id, text, show_alert } = payload;
    await firstValueFrom(
      this.httpService.post('answerCallbackQuery', {
        callback_query_id,
        text,
        show_alert,
      }),
    );
  }

  async editMessageReplyMarkup(
    payload: TGEditMessageReplyMarkup,
  ): Promise<TGMessage> {
    const { chatId, messageId, replyMarkup } = payload;
    const res = await firstValueFrom(
      this.httpService.post('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      }),
    );
    return res.data.result;
  }

  async editMessageText(payload: TGEditMessageText): Promise<TGMessage> {
    const {
      chatId,
      messageId,
      text,
      replyMarkup,
      parseMode,
      disableWebPagePreview,
    } = payload;
    const res = await firstValueFrom(
      this.httpService.post('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: disableWebPagePreview,
        reply_markup: replyMarkup,
      }),
    );
    return res.data.result;
  }

  async editMessageCaption(payload: TGEditMessageCaption): Promise<TGMessage> {
    const {
      chatId,
      messageId,
      caption,
      replyMarkup,
      parseMode,
      disableWebPagePreview,
    } = payload;

    const res = await firstValueFrom(
      this.httpService.post('editMessageCaption', {
        chat_id: chatId,
        message_id: messageId,
        caption,
        parse_mode: parseMode,
        disable_web_page_preview: disableWebPagePreview,
        reply_markup: replyMarkup,
      }),
    );

    return res.data.result;
  }

  async editMessageMedia(payload: TGEditMessageMedia): Promise<TGMessage> {
    const { chatId, messageId, media, replyMarkup } = payload;
    const res = await firstValueFrom(
      this.httpService.post('editMessageMedia', {
        chat_id: chatId,
        message_id: messageId,
        media,
        reply_markup: replyMarkup,
      }),
    );

    return res.data.result;
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
        return this.editMessageMedia({
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
      return this.editMessageCaption({
        chatId,
        messageId,
        caption,
        parseMode: 'HTML',
        disableWebPagePreview: true,
        replyMarkup,
      });
    }

    return this.editMessageText({
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
        return this.editMessageMedia({
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
      return this.editMessageCaption({
        chatId,
        messageId,
        caption,
        parseMode: 'HTML',
        disableWebPagePreview: true,
      });
    }

    return this.editMessageText({
      chatId,
      messageId,
      text: caption,
      parseMode: 'HTML',
      disableWebPagePreview: true,
    });
  }

  parseTelegramInitDataString(initData: string): {
    parsedData: Record<string, string>;
    dataCheckString: string;
  } {
    const pairs = initData.split('&');
    const parsedData = {};

    pairs.forEach((pair) => {
      const [key, value] = pair.split('=');
      parsedData[key] = decodeURIComponent(value);
    });

    const keys = Object.keys(parsedData)
      .filter((key) => key !== 'hash')
      .sort();

    return {
      dataCheckString: keys
        .map((key) => `${key}=${parsedData[key]}`)
        .join('\n'),
      parsedData,
    };
  }

  validateTelegramInitData(dataCheckString: string, receivedHash: string) {
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN)
      .digest();

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== receivedHash) {
      throw new Error('Invalid initData');
    }
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

  private getPoster({ poster, post }: GetPosterPayload): string | undefined {
    if (post?.fileId) {
      return post.fileId;
    }

    return this.getPosterUrl(poster);
  }

  private publish(payload: PublishPayload): Promise<TGMessage> {
    const { caption, message, photo, gigId } = payload;

    return this.send(
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
    const poster = this.getPoster({ post: moderationPost, poster: gig.poster });

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
    const poster = this.getPoster({ poster: gig.poster });

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

  async handlePostPublish(payload: HandlePostPublishPayload) {
    const { suggestedBy, moderationPost, publishPost, title, publicId } =
      payload;
    const editGigUrl = publicId ? this.buildEditGigUrl(publicId) : undefined;

    const publishPostChatIdUrl = this.getPostLink({
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
    await this.editMessageCaption({
      chatId: moderationPost.chatId,
      messageId: moderationPost.messageId,
      caption: title,
      parseMode: 'HTML',
      disableWebPagePreview: true,
      replyMarkup,
    });

    const publishPostUsernameUrl = this.getPostLink({
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
    await this.editMessageReplyMarkup({
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

    return this.editMessageCaption({
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
    const poster = this.getPoster({ post: moderationPost, poster: gig.poster });

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

  private async getChat(chatIdOrUsername: number | string): Promise<TGChat> {
    const res$ = this.httpService.get('getChat', {
      params: { chat_id: chatIdOrUsername },
    });
    const { data } = await firstValueFrom(res$);

    if (!data.ok) {
      throw new Error(
        `Telegram getChat error ${data.error_code}: ${data.description}`,
      );
    }

    return data.result;
  }

  public async getChatUsername(
    chatId: TGChat['id'],
  ): Promise<TGChat['username']> {
    const key = `chat:${chatId}`;
    const cachedChat = await this.cache.get<TGChat>(key);
    if (cachedChat) return cachedChat.username;

    const chat = await this.getChat(chatId);
    await this.cache.set(key, chat);
    return chat.username;
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

  getPostLink(payload: GetPostLinkPayload): string | undefined {
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
