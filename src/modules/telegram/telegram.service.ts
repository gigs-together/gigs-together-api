import { Injectable } from '@nestjs/common';
import type {
  InputFile,
  TGChatId,
  TGEditMessageReplyMarkup,
  TGMessage,
  TGSendMessage,
  TGSendPhoto,
} from './types/message.types';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { GigService } from '../gig/gig.service';
import type { GigDocument } from '../gig/gig.schema';
import type { GigId, SubmitGig } from '../gig/types/gig.types';
import { Status } from '../gig/types/status.enum';
import type {
  TGAnswerCallbackQuery,
  TGCallbackQuery,
} from './types/update.types';
import * as FormData from 'form-data';

enum Command {
  Start = 'start',
}

enum Action {
  Approve = 'approve',
  Reject = 'reject',
  Rejected = 'rejected',
}

@Injectable()
export class TelegramService {
  constructor(
    private readonly httpService: HttpService,
    private readonly gigService: GigService,
  ) {}

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
      console.error('send error:', e?.response?.data ?? e);
    }
  }

  private async sendMessage(payload: TGSendMessage): Promise<TGMessage> {
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

  async handleMessage(message: TGMessage): Promise<void> {
    const chatId = message?.chat?.id;
    if (!chatId) {
      return;
    }

    const text = message.text || '';

    if (text.charAt(0) !== '/') {
      await this.sendMessage({
        chat_id: chatId,
        text: `You said: "${text}"`,
      });
      return;
    }

    const command = text.substring(1).toLowerCase();
    await this.handleCommand(command, chatId);
  }

  private async handleCommand(command: string, chatId: number) {
    switch (command) {
      case Command.Start: {
        await this.sendMessage({
          chat_id: chatId,
          text: `Hi! I'm a Gigs Together bot. I am still in development...`,
        });
        break;
      }
      default: {
        await this.sendMessage({
          chat_id: chatId,
          text: `Hey there, I don't know that command.`,
        });
      }
    }
  }

  async handleCallbackQuery(callbackQuery: TGCallbackQuery): Promise<void> {
    console.log('callbackQuery', callbackQuery);
    const [action, gigId] = callbackQuery.data.split(':');
    // TODO: some more security?
    switch (action) {
      case Action.Approve: {
        await this.handleGigApprove({
          gigId,
          messageId: callbackQuery.message.message_id,
          chatId: callbackQuery.message.chat.id,
        });
        break;
      }
      case Action.Reject: {
        await this.handleGigReject({
          gigId,
          messageId: callbackQuery.message.message_id,
          chatId: callbackQuery.message.chat.id,
        });
        break;
      }
      case Action.Rejected: {
        const text = "There's no action for Rejected yet.";
        console.log(text);
        await this.answerCallbackQuery({
          callback_query_id: callbackQuery.id,
          text,
          show_alert: false,
        });
        return;
      }
      default: {
        await this.answerCallbackQuery({
          callback_query_id: callbackQuery.id,
          text: 'Go write better code!',
          show_alert: true,
        });
        return;
      }
    }

    await this.answerCallbackQuery({
      callback_query_id: callbackQuery.id,
      text: 'Done!',
      show_alert: false,
    });
  }

  private async answerCallbackQuery(
    payload: TGAnswerCallbackQuery,
  ): Promise<void> {
    const { callback_query_id, text, show_alert } = payload;
    await firstValueFrom(
      this.httpService.post('answerCallbackQuery', {
        callback_query_id,
        text,
        show_alert,
      }),
    );
  }

  private async editMessageReplyMarkup(
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
        photo: gig.photo.url,
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

  async handleGigSubmit(data: SubmitGig): Promise<void> {
    // TODO: add transaction?
    const savedGig = await this.gigService.saveGig(data.gig);
    const res = await this.publishDraft(savedGig);
    const _data = {
      photo: { url: data.gig.photo.url, tgFileId: res.photo?.[0].file_id },
      status: Status.Pending,
    };
    try {
      await this.gigService.updateGig(savedGig._id, _data);
    } catch (e) {
      console.error('updateGig', e);
    }
  }

  async handleGigApprove(payload: {
    gigId: GigId;
    chatId: TGChatId;
    messageId: number;
  }): Promise<void> {
    // TODO: add transaction?
    const { gigId, chatId, messageId } = payload;
    const updatedGig = await this.gigService.updateGigStatus(
      gigId,
      Status.Approved,
    );
    await this.publishMain(updatedGig);
    await this.gigService.updateGigStatus(gigId, Status.Published);
    console.log(`Gig #${gigId} approved`);
    const replyMarkup = {
      inline_keyboard: [],
    };
    await this.editMessageReplyMarkup({ chatId, messageId, replyMarkup });
  }

  async handleGigReject(payload: {
    gigId: GigId;
    chatId: TGChatId;
    messageId: number;
  }): Promise<void> {
    const { gigId, chatId, messageId } = payload;
    await this.gigService.updateGigStatus(gigId, Status.Rejected);
    console.log(`Gig #${gigId} rejected`);
    const replyMarkup = {
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
    };
    await this.editMessageReplyMarkup({ chatId, messageId, replyMarkup });
  }
}
