import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  InputFile,
  TGEditMessageCaption,
  TGEditMessageReplyMarkup,
  TGMessage,
  TGSendMessage,
  TGSendPhoto,
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
import type { TGChatId } from './types/message.types';
import { BucketService } from '../bucket/bucket.service';

interface PublishPayload {
  id: string;
  date: string | number | Date;
  endDate?: string | number | Date;
  venue: string;
  title: string;
  ticketsUrl: string;
  url?: string;
  post?: GigPost;
  poster?: GigPoster;
  message: Omit<TGSendPhoto, 'photo'>;
}

interface EditSubmissionFeedbackPayload {
  chatId: TGChatId;
  messageId: number;
  title: string;
  status: string;
  url?: string;
}

@Injectable()
export class TelegramService {
  constructor(
    private readonly httpService: HttpService,
    private readonly bucketService: BucketService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  private readonly logger = new Logger(TelegramService.name);

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

  async editMessageCaption(payload: TGEditMessageCaption): Promise<TGMessage> {
    const { chatId, messageId, caption, replyMarkup } = payload;
    const res = await firstValueFrom(
      this.httpService.post('editMessageCaption', {
        chat_id: chatId,
        message_id: messageId,
        caption,
        reply_markup: replyMarkup,
      }),
    );

    return res.data.result;
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

  private publish(payload: PublishPayload): Promise<TGMessage> {
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

    const text = [
      payload.url
        ? `<a href="${payload.url}">${payload.title}</a>`
        : payload.title,
      '',
      `🗓 ${dates}`,
      `📍 ${payload.venue}`,
      '',
      `🎫 ${payload.ticketsUrl}`,
    ].join('\n');

    const photo =
      payload.poster &&
      (payload.post?.fileId ||
        (payload.poster.bucketPath
          ? (this.bucketService.getPublicFileUrl(payload.poster.bucketPath) ??
            payload.poster.externalUrl)
          : payload.poster.externalUrl));

    return this.send(
      {
        text,
        caption: text,
        photo,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...payload.message,
      },
      payload.id,
    );
  }

  async publishMain(gig: GigDocument): Promise<TGMessage> {
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

    const payload: PublishPayload = {
      url,
      id: String(gig._id),
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      post: gig.post,
      poster: gig.poster,
      date: gig.date,
      endDate: gig.endDate,
      message: { chat_id: chatId },
    };

    return this.publish(payload);
  }

  async sendToModeration(gig: GigDocument): Promise<TGMessage> {
    const chatId = process.env.MODERATION_CHANNEL_ID;
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '✅ Approve',
            callback_data: `${Action.Approve}:${gig._id}`,
          },
          {
            text: '❌ Reject',
            callback_data: `${Action.Reject}:${gig._id}`,
          },
        ],
      ],
    };

    const payload: PublishPayload = {
      id: String(gig._id),
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      post: gig.post,
      poster: gig.poster,
      date: gig.date,
      endDate: gig.endDate,
      message: {
        chat_id: chatId,
        reply_markup: replyMarkup,
      },
    };

    return this.publish(payload);
  }

  async handlePostPublish({ suggestedBy, moderationMessage, title, url }) {
    // TODO:
    // await this.editMessageCaption({
    await this.editMessageReplyMarkup({
      chatId: moderationMessage.chatId,
      messageId: moderationMessage.messageId,
      replyMarkup: {
        inline_keyboard: [],
      },
    });

    await this.editSubmissionFeedback({
      chatId: suggestedBy.userId,
      messageId: suggestedBy.feedbackMessageId,
      title,
      status: 'Published',
      url,
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
                  text: 'See post',
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

    const payload: PublishPayload = {
      id: String(gig._id),
      title: gig.title,
      ticketsUrl: gig.ticketsUrl,
      venue: gig.venue,
      post: gig.post,
      poster: gig.poster,
      date: gig.date,
      endDate: gig.endDate,
      message: {
        chat_id: chatId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `⏳ ${statusForUser}`,
                callback_data: `${Action.Status}:${statusForUser}`,
              },
            ],
          ],
        },
      },
    };

    // TODO: add some language like "You've submitted, blablabla..."
    return this.publish(payload);
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

  getPostLink({ username, id }): string | undefined {
    if (!username || !id) return;
    return `https://t.me/${username}/${id}`;
  }
}
