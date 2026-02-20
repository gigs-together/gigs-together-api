import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  InputFile,
  TGEditMessageReplyMarkup,
  TGMessage,
  TGSendMessage,
  TGSendPhoto,
} from './types/message.types';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import type { GigDocument } from '../gig/gig.schema';
import type { TGAnswerCallbackQuery } from './types/update.types';
import FormData from 'form-data';
import { Action } from './types/action.enum';
import { TGChat } from './types/chat.types';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type { TGChatId } from './types/message.types';
import { BucketService } from '../bucket/bucket.service';

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
    gig?: GigDocument,
  ): Promise<TGMessage | undefined> {
    try {
      if (this.isPhotoPayload(payload)) {
        return this.sendPhoto(payload, gig);
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
    gig?: GigDocument,
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
            gig,
          );
          if (downloaded) {
            return this.sendPhoto({ ...payload, photo: downloaded }, gig);
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
    const filename = `poster${gig?._id}.jpg`;
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
    gig?: GigDocument,
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
      const filename =
        this.guessFilenameFromUrl(url) ?? `poster${gig?._id ?? ''}.jpg`;

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
  ): Promise<void> {
    const { chatId, messageId, replyMarkup } = payload;
    await firstValueFrom(
      this.httpService.post('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      }),
    );
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

  private async publish(
    gig: GigDocument,
    messagePayload: Omit<TGSendPhoto, 'photo'>,
  ): Promise<TGMessage> {
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short', // e.g., "Nov"
      day: '2-digit',
    });
    const date = dateFormatter.format(new Date(gig.date));
    const endDate = gig.endDate
      ? dateFormatter.format(new Date(gig.endDate))
      : undefined;
    const dates = [date, endDate].filter(Boolean).join(' - ');

    const text = [
      `<a href="${process.env.APP_BASE_URL}">${gig.title}</a>`, // TODO
      '',
      `🗓 ${dates}`,
      `📍 ${gig.venue}`,
      '',
      `🎫 ${gig.ticketsUrl}`,
    ].join('\n');

    const photo =
      gig.poster &&
      (gig.post?.fileId ||
        (gig.poster.bucketPath
          ? (this.bucketService.getPublicFileUrl(gig.poster.bucketPath) ??
            gig.poster.externalUrl)
          : gig.poster.externalUrl));

    return this.send(
      {
        text,
        caption: text,
        photo,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...messagePayload,
      },
      gig,
    );
  }

  async publishMain(gig: GigDocument): Promise<TGMessage> {
    const chatId = process.env.MAIN_CHANNEL_ID;
    return this.publish(gig, { chat_id: chatId });
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
    return this.publish(gig, { chat_id: chatId, reply_markup: replyMarkup });
  }

  async handlePostPublish({ suggestedBy, moderationMessage }) {
    await this.editMessageReplyMarkup({
      chatId: moderationMessage.chatId,
      messageId: moderationMessage.messageId,
      replyMarkup: {
        inline_keyboard: [],
      },
    });

    if (suggestedBy.userId && suggestedBy.feedbackMessageId) {
      const statusForUser = 'Published';
      await this.editMessageReplyMarkup({
        chatId: suggestedBy.userId,
        messageId: suggestedBy.feedbackMessageId,
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: `✅ ${statusForUser}`,
                callback_data: `${Action.Status}:${statusForUser}`,
              },
            ],
          ],
        },
      });
    }
  }

  async handlePostReject({ suggestedBy, moderationMessage, gigId }) {
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

    if (suggestedBy.userId && suggestedBy.feedbackMessageId) {
      const statusForUser = 'Rejected';
      await this.editMessageReplyMarkup({
        chatId: suggestedBy.userId,
        messageId: suggestedBy.feedbackMessageId,
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: `❌ ${statusForUser}`,
                callback_data: `${Action.Status}:${statusForUser}`,
              },
            ],
          ],
        },
      });
    }
  }

  async sendSubmissionFeedback(
    gig: GigDocument,
    chatId: TGChatId,
  ): Promise<TGMessage> {
    const statusForUser = 'Pending';
    // TODO: add some language like "You've submitted, blablabla..."
    return this.publish(gig, {
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
}
