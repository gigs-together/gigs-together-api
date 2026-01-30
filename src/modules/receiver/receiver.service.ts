import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { TGChatId, TGMessage } from '../telegram/types/message.types';
import { GigService } from '../gig/gig.service';
import type { Gig } from '../gig/gig.schema';
import type { GigId } from '../gig/types/gig.types';
import { Status } from '../gig/types/status.enum';
import type { TGCallbackQuery } from '../telegram/types/update.types';
import { TelegramService } from '../telegram/telegram.service';
import { Action } from '../telegram/types/action.enum';
import { getBiggestTgPhotoFileId } from '../telegram/utils/photo';
import { V1ReceiverCreateGigRequestBodyValidated } from './types/requests/v1-receiver-create-gig-request';
import { CalendarService } from '../calendar/calendar.service';
// import { NodeHttpHandler } from '@smithy/node-http-handler';

type UpdateGigPayload = Pick<Gig, 'status'> & Partial<Pick<Gig, 'poster'>>;

enum Command {
  Start = 'start',
}

@Injectable()
export class ReceiverService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly gigService: GigService,
    private readonly calendarService: CalendarService,
  ) {}

  private readonly logger = new Logger(ReceiverService.name);

  private formatCallbackQueryError(e: any): string {
    const data = e?.response?.data;
    const tgDescription: string | undefined = data?.description;
    if (tgDescription) return `Failed: ${tgDescription}`;

    if (e instanceof BadRequestException) {
      const res = e.getResponse() as any;
      const msg =
        typeof res === 'string'
          ? res
          : Array.isArray(res?.message)
            ? res.message.join(', ')
            : (res?.message ?? e.message);
      return `Failed: ${String(msg)}`;
    }

    if (e instanceof Error) return `Failed: ${e.message}`;
    return 'Failed: unknown error';
  }

  async handleMessage(message: TGMessage): Promise<void> {
    const chatId = message?.chat?.id;
    if (!chatId) {
      return;
    }

    const text = message.text || '';

    if (text.charAt(0) !== '/') {
      await this.telegramService.sendMessage({
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
        await this.telegramService.sendMessage({
          chat_id: chatId,
          text: `Hi! I'm a Gigs Together bot. I am still in development...`,
        });
        break;
      }
      default: {
        await this.telegramService.sendMessage({
          chat_id: chatId,
          text: `Hey there, I don't know that command.`,
        });
      }
    }
  }

  // TODO: move to telegram module and use dependency injection?
  private async processCallbackQueryOrThrow(
    callbackQuery: TGCallbackQuery,
  ): Promise<void> {
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
        await this.telegramService.answerCallbackQuery({
          callback_query_id: callbackQuery.id,
          text,
          show_alert: false,
        });
        return;
      }
      default: {
        await this.telegramService.answerCallbackQuery({
          callback_query_id: callbackQuery.id,
          text: 'Go write better code!',
          show_alert: true,
        });
        return;
      }
    }

    await this.telegramService.answerCallbackQuery({
      callback_query_id: callbackQuery.id,
      text: 'Done!',
      show_alert: false,
    });
  }

  async handleCallbackQuery(callbackQuery: TGCallbackQuery): Promise<void> {
    try {
      await this.processCallbackQueryOrThrow(callbackQuery);
    } catch (e) {
      this.logger.warn(
        `handleCallbackQuery failed: ${JSON.stringify(
          e?.response?.data ?? e?.message ?? e,
        )}`,
      );
      await this.telegramService.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: this.formatCallbackQueryError(e),
        show_alert: true,
      });
    }
  }

  async handleGigSubmit(
    body: V1ReceiverCreateGigRequestBodyValidated,
    posterFile: Express.Multer.File | undefined,
  ): Promise<void> {
    const poster = await this.gigService.getCreateGigUploadedPosterData({
      url: body.gig.posterUrl,
      file: posterFile,
    });

    const data = {
      gig: {
        title: body.gig.title,
        date: body.gig.date,
        city: body.gig.city,
        country: body.gig.country,
        venue: body.gig.venue,
        ticketsUrl: body.gig.ticketsUrl,
        poster,
      },
      isAdmin: body.user?.isAdmin,
    };

    // TODO: add transaction?
    const savedGig = await this.gigService.saveGig(data.gig);
    let res: TGMessage | undefined;
    try {
      res = await this.telegramService.publishDraft(savedGig);
    } catch (e) {
      // Publishing to Telegram shouldn't block gig creation.
      this.logger.warn(
        `publishDraft failed: ${JSON.stringify(e?.response?.data ?? e?.message ?? e)}`,
      );
      res = undefined;
    }

    const biggestTgPhotoFileId = getBiggestTgPhotoFileId(res?.photo);

    const updateGigPayload: UpdateGigPayload = {
      status: Status.Pending,
    };
    if (posterBucketPath || posterExternalUrl) {
      updateGigPayload.poster = {
        tgFileId: biggestTgPhotoFileId,
      };
      if (posterExternalUrl) {
        updateGigPayload.poster.externalUrl = posterExternalUrl;
      }
      if (posterBucketPath) {
        updateGigPayload.poster.bucketPath = posterBucketPath;
      }
    }
    try {
      await this.gigService.updateGig(savedGig._id, updateGigPayload);
    } catch (e) {
      this.logger.error(
        'updateGig failed',
        e instanceof Error ? e.stack : undefined,
      );
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
    await this.telegramService.publishMain(updatedGig);
    await this.gigService.updateGigStatus(gigId, Status.Published);
    this.logger.log(`Gig #${gigId} approved`);
    const replyMarkup = {
      inline_keyboard: [],
    };
    await this.telegramService.editMessageReplyMarkup({
      chatId,
      messageId,
      replyMarkup,
    });
    const calendarGig = this.gigService.gigToCalendarPayload(updatedGig);
    await this.calendarService.addEvent(calendarGig);
  }

  async handleGigReject(payload: {
    gigId: GigId;
    chatId: TGChatId;
    messageId: number;
  }): Promise<void> {
    const { gigId, chatId, messageId } = payload;
    await this.gigService.updateGigStatus(gigId, Status.Rejected);
    this.logger.log(`Gig #${gigId} rejected`);
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
    await this.telegramService.editMessageReplyMarkup({
      chatId,
      messageId,
      replyMarkup,
    });
  }
}
