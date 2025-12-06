import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class TelegramService {
  constructor(private readonly httpService: HttpService) {}

  private readonly logger = new Logger(TelegramService.name);

  async send(
    payload: TGSendMessage | TGSendPhoto,
    gig?: GigDocument,
  ): Promise<TGMessage | undefined> {
    try {
      if (this.isPhotoPayload(payload)) {
        return await this.sendPhoto(payload, gig);
      }
      return await this.sendMessage(payload);
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
      const res$ = this.httpService.post('sendPhoto', payload);
      const res = await firstValueFrom(res$);
      return res.data.result;
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
      return;
    }
    if (typeof photo.buffer !== 'undefined') {
      form.append('photo', photo.buffer, {
        filename: photo.filename,
        contentType: photo.contentType,
      });
      return;
    }
    form.append('photo', photo, { filename });

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
    return 'photo' in payload;
  }

  private isPhotoString(photo: string | InputFile): photo is string {
    return typeof photo === 'string';
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
    // Set start time to 8:00 PM
    const startDateTime = new Date(gig.date);
    startDateTime.setHours(20, 0, 0, 0); // Set to 8:00 PM (20:00)

    // Calculate end time (2 hours later)
    const endDateTime = new Date(startDateTime);
    endDateTime.setHours(startDateTime.getHours() + 2); // Add 2 hours

    // await this.calendarService.addEvent({
    //   title: gig.title,
    //   ticketsUrl: gig.ticketsUrl,
    //   location: gig.location,
    //   startDate: startDateTime,
    //   endDate: endDateTime,
    // });

    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short', // e.g., "Nov"
      day: '2-digit',
    });
    const formattedDate = dateFormatter.format(new Date(gig.date));

    const text = [
      gig.title,
      '',
      `🗓 ${formattedDate}`,
      `📍 ${gig.location}`,
      '',
      `🎫 ${gig.ticketsUrl}`,
    ].join('\n');

    return this.send(
      {
        text,
        caption: text,
        photo: gig.photo.tgFileId || gig.photo.url,
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
}
