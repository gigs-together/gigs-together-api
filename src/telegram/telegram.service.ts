import { Injectable } from '@nestjs/common';
import { TGChatId, TGMessage, TGSendMessage } from './types/message.types';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { GigService } from '../gig/gig.service';
import { GigDocument } from '../schemas/gig.schema';
import type { GigId, SubmitGig } from '../gig/types/gig.types';
import { Status } from '../gig/types/status.enum';
import { TGCallbackQuery } from './types/update.types';

enum Command {
  Start = 'start',
}

@Injectable()
export class TelegramService {
  constructor(
    private readonly httpService: HttpService,
    private readonly gigService: GigService,
  ) {}

  async sendMessage({ chatId, text, ...rest }: TGSendMessage): Promise<void> {
    const body = {
      chat_id: chatId, // 1-4096 characters after entities parsing
      text,
      ...rest,
    };

    try {
      const res$ = this.httpService.post('sendMessage', body);
      const res = await firstValueFrom(res$);
      console.log(`sendMessage: ${JSON.stringify(res.data)}`);
    } catch (e) {
      console.error('sendMessage error:', e?.response?.data);
    }
  }

  async handleMessage(message: TGMessage): Promise<void> {
    if (!message?.chat?.id) {
      return;
    }
    const messageText = message.text || '';
    const chatId = message.chat.id;

    if (messageText.charAt(0) !== '/') {
      await this.sendMessage({
        chatId,
        text: `You said: "${messageText}"`,
      });
      return;
    }

    const command = messageText.substring(1).toLowerCase();
    await this.handleCommand(command, chatId);
  }

  private async handleCommand(command: string, chatId: number) {
    switch (command) {
      case Command.Start: {
        await this.sendMessage({
          chatId,
          text: `Hi! I'm a Gigs Together bot. I am still in development...`,
        });
        break;
      }
      default: {
        await this.sendMessage({
          chatId,
          text: `Hey there, I don't know that command.`,
        });
      }
    }
  }

  async handleCallbackQuery(callbackQuery: TGCallbackQuery): Promise<void> {
    if (callbackQuery) {
      // TODO
      const gigId = callbackQuery.data.split(':')[1];
      await this.handleGigApprove(gigId);
      console.log('callbackQuery', callbackQuery);
    }

    await firstValueFrom(
      this.httpService.post('answerCallbackQuery', {
        callback_query_id: callbackQuery.id,
        // text,
        // show_alert: showAlert,
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

  async #publish(
    gig: GigDocument,
    chatId: TGChatId,
    extra: any = {},
  ): Promise<void> {
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

    await this.sendMessage({
      chatId,
      text,
      ...extra,
    });
  }

  async publish(gig: GigDocument): Promise<void> {
    const chatId = process.env.MAIN_CHANNEL_ID;
    await this.#publish(gig, chatId);
  }

  async publishDraft(gig: GigDocument): Promise<void> {
    const chatId = process.env.DRAFT_CHANNEL_ID;
    const extra = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ Approve',
              callback_data: `approve:${gig._id}`,
            },
            {
              text: '❌ Deny',
              callback_data: `deny:${gig._id}`,
            },
          ],
        ],
      },
    };
    await this.#publish(gig, chatId, extra);
  }

  async handleGigSubmit(data: SubmitGig): Promise<void> {
    // TODO: add transaction?
    const savedGig = await this.gigService.saveGig(data.gig);
    await this.publishDraft(savedGig);
  }

  async handleGigApprove(gigId: GigId): Promise<void> {
    // TODO: add transaction?
    const updatedGig = await this.gigService.updateGigStatus(
      gigId,
      Status.approved,
    );
    await this.publish(updatedGig);
    await this.gigService.updateGigStatus(gigId, Status.published);
  }
}
