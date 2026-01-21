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
import { BucketService } from '../bucket/bucket.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getGigPhotosPrefixWithSlash } from '../bucket/gig-photos';
// import { NodeHttpHandler } from '@smithy/node-http-handler';

type UpdateGigPayload = Pick<Gig, 'status'> & Partial<Pick<Gig, 'photo'>>;

enum Command {
  Start = 'start',
}

@Injectable()
export class ReceiverService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly gigService: GigService,
    private readonly bucketService: BucketService,
    private readonly httpService: HttpService,
  ) {}

  private readonly logger = new Logger(ReceiverService.name);

  // S3/Bucket logic moved to BucketService.

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

  async handleCallbackQuery(callbackQuery: TGCallbackQuery): Promise<void> {
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

    // TODO: if error - send corresponding message
    await this.telegramService.answerCallbackQuery({
      callback_query_id: callbackQuery.id,
      text: 'Done!',
      show_alert: false,
    });
  }

  async handleGigSubmit(
    body: V1ReceiverCreateGigRequestBodyValidated,
    photoFile: Express.Multer.File | undefined,
  ): Promise<void> {
    const urlFromBody = body.gig.photoUrl ?? body.gig.photo;

    let photoPath: string | undefined;
    let externalUrl: string | undefined;

    if (photoFile) {
      photoPath = await this.uploadGigPhoto({
        buffer: photoFile.buffer,
        filename: photoFile.originalname,
        mimetype: photoFile.mimetype,
      });
    } else if (urlFromBody) {
      // Reuse already downloaded photo if exists
      const existing =
        await this.gigService.findByExternalPhotoUrl(urlFromBody);
      // TODO: also look by photo equality
      if (existing?.photo?.url) {
        photoPath = this.toStoredGigPhotoPath(existing.photo.url);
        externalUrl = urlFromBody;
      } else {
        const downloaded = await this.downloadPhoto(urlFromBody);
        photoPath = await this.uploadGigPhoto(downloaded);
        externalUrl = urlFromBody;
      }
    }

    const data = {
      gig: {
        title: body.gig.title,
        date: body.gig.date,
        location: body.gig.location,
        ticketsUrl: body.gig.ticketsUrl,
        ...(photoPath
          ? { photo: { url: photoPath, externalUrl } }
          : externalUrl
            ? { photo: { externalUrl } }
            : {}),
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
    if (photoPath || externalUrl) {
      updateGigPayload.photo = {
        tgFileId: biggestTgPhotoFileId,
      };
      if (externalUrl) {
        updateGigPayload.photo.externalUrl = externalUrl;
      }
      if (photoPath) {
        updateGigPayload.photo.url = photoPath;
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

  private async uploadGigPhoto(input: {
    buffer: Buffer;
    filename: string;
    mimetype?: string;
  }): Promise<string> {
    return this.bucketService.uploadGigPhoto(input);
  }

  private async downloadPhoto(url: string): Promise<{
    buffer: Buffer;
    filename: string;
    mimetype?: string;
  }> {
    let filename = 'photo.jpg';
    try {
      const parsed = new URL(url);
      const last = parsed.pathname.split('/').filter(Boolean).pop();
      if (last) filename = last;
    } catch {
      throw new BadRequestException('photoUrl must be a valid URL');
    }

    try {
      const res = await firstValueFrom(
        this.httpService.get<ArrayBuffer>(url, {
          responseType: 'arraybuffer',
          timeout: 15_000,
        }),
      );
      const contentType =
        res.headers['content-type'] || res.headers['Content-Type'];
      const ct = Array.isArray(contentType) ? contentType[0] : contentType;

      if (ct && !ct.toLowerCase().startsWith('image/')) {
        throw new BadRequestException(
          `photoUrl must point to an image (content-type: "${ct}")`,
        );
      }

      return {
        buffer: Buffer.from(res.data),
        filename,
        mimetype: ct,
      };
    } catch (e) {
      // Keep message user-friendly; don't leak internals.
      const msg = String(e?.message ?? 'unknown error');
      throw new BadRequestException(`Failed to download photo: ${msg}`);
    }
  }

  private toStoredGigPhotoPath(value: string): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return trimmed;

    const normalizeFromPathname = (pathname: string): string => {
      let p = (pathname ?? '').trim();
      if (!p) return p;

      // If stored as a public route, extract the S3 key part.
      const proxyPrefix = '/public/files-proxy/';
      const redirectPrefix = '/public/files/';
      if (p.startsWith(proxyPrefix)) p = `/${p.slice(proxyPrefix.length)}`;
      else if (p.startsWith(redirectPrefix))
        p = `/${p.slice(redirectPrefix.length)}`;

      const prefix = getGigPhotosPrefixWithSlash(); // "<prefix>/"
      // Accept both "<prefix>/..." and "/<prefix>/..."
      if (p.startsWith(prefix)) return `/${p}`;
      if (p.startsWith(`/${prefix}`)) return p;

      return p;
    };

    // Absolute URL -> use pathname.
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        return normalizeFromPathname(new URL(trimmed).pathname);
      } catch {
        return trimmed;
      }
    }

    return normalizeFromPathname(trimmed);
  }
}
