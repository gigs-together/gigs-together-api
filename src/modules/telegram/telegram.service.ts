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
import * as FormData from 'form-data';
import { Action } from './types/action.enum';
import { getGigPostersPrefixWithSlash } from '../bucket/gig-posters';
import { TGChat } from './types/chat.types';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class TelegramService {
  constructor(
    private readonly httpService: HttpService,
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

  private toPublicFilesProxyPath(value: string): string {
    if (!value) return value;
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    if (this.isHttpUrl(trimmed)) return trimmed;

    const prefix = getGigPostersPrefixWithSlash(); // "<prefix>/"
    // If we store only the S3 key path ("/<prefix>/..."), convert it to our public proxy route.
    if (trimmed.startsWith(`/${prefix}`))
      return `/public/files-proxy${trimmed}`;
    if (trimmed.startsWith(prefix)) return `/public/files-proxy/${trimmed}`;

    return trimmed;
  }

  private toAbsolutePublicUrlForTelegram(value: string): string {
    if (!value) return value;
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    if (this.isHttpUrl(trimmed)) return trimmed;
    if (trimmed.startsWith('/')) {
      const baseRaw = (process.env.APP_API_BASE_URL ?? '').trim();
      if (!baseRaw) {
        // Telegram rejects relative URLs with: "URL host is empty"
        throw new Error(
          'Telegram photo URL is relative; set APP_API_BASE_URL to make it absolute',
        );
      }
      // IMPORTANT:
      // - Use URL resolution (not string concat) so if base contains a path like
      //   "https://host/api", "/public/..." still resolves to "https://host/public/...".
      // - Be forgiving if the base is provided without a scheme.
      const base = /^[a-z][a-z0-9+.-]*:\/\//i.test(baseRaw)
        ? baseRaw
        : `https://${baseRaw}`;
      try {
        return new URL(trimmed, base).toString();
      } catch {
        throw new Error(`Invalid APP_API_BASE_URL: "${baseRaw}"`);
      }
    }
    return trimmed;
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
    const formattedDate = dateFormatter.format(new Date(gig.date));

    const text = [
      `<a href="${process.env.APP_BASE_URL}">${gig.title}</a>`,
      '',
      `🗓 ${formattedDate}`,
      `📍 ${gig.venue}`,
      '',
      `🎫 ${gig.ticketsUrl}`,
    ].join('\n');

    const photo =
      gig.poster &&
      (gig.poster.tgFileId ||
        (gig.poster.bucketPath
          ? this.toAbsolutePublicUrlForTelegram(
              this.toPublicFilesProxyPath(gig.poster.bucketPath),
            )
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

  async publishDraft(gig: GigDocument): Promise<TGMessage> {
    const chatId = process.env.DRAFT_CHANNEL_ID;
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
