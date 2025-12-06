import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { TGChatId, TGMessage } from '../telegram/types/message.types';
import { GigService } from '../gig/gig.service';
import type { GigId } from '../gig/types/gig.types';
import { Status } from '../gig/types/status.enum';
import type { TGCallbackQuery } from '../telegram/types/update.types';
import { TelegramService } from '../telegram/telegram.service';
import { Action } from '../telegram/types/action.enum';
import { V1ReceiverCreateGigRequestBodyValidated } from './requests/v1-receiver-create-gig-request';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

enum Command {
  Start = 'start',
}

@Injectable()
export class ReceiverService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly gigService: GigService,
    private readonly httpService: HttpService,
  ) {}

  private readonly logger = new Logger(ReceiverService.name);
  private readonly s3 = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: Boolean(process.env.S3_FORCE_PATH_STYLE),
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

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

    await this.telegramService.answerCallbackQuery({
      callback_query_id: callbackQuery.id,
      text: 'Done!',
      show_alert: false,
    });
  }

  private normalizeCreateGigBody(body: any) {
    // In multipart/form-data nested object as string
    // gig = JSON-string
    if (typeof body?.gig === 'string') {
      try {
        body.gig = JSON.parse(body.gig);
      } catch {
        throw new BadRequestException('gig must be a valid JSON string');
      }
    }
    return body;
  }

  async handleGigSubmit(
    body: any,
    photoFile: Express.Multer.File | undefined,
  ): Promise<void> {
    const gigBody = this.normalizeCreateGigBody(
      body,
    ) as V1ReceiverCreateGigRequestBodyValidated;

    const urlFromBody = gigBody.gig.photoUrl ?? gigBody.gig.photo;

    let photoUrl: string | undefined;
    let externalUrl: string | undefined;

    if (photoFile) {
      photoUrl = await this.uploadGigPhoto({
        buffer: photoFile.buffer,
        filename: photoFile.originalname,
        mimetype: photoFile.mimetype,
      });
    } else if (urlFromBody) {
      // Reuse already downloaded photo if exists
      const existing =
        await this.gigService.findByExternalPhotoUrl(urlFromBody);
      if (existing?.photo?.url) {
        photoUrl = existing.photo.url;
        externalUrl = urlFromBody;
      } else {
        const downloaded = await this.downloadPhoto(urlFromBody);
        photoUrl = await this.uploadGigPhoto(downloaded);
        externalUrl = urlFromBody;
      }
    }

    const data = {
      gig: {
        title: gigBody.gig.title,
        date: gigBody.gig.date,
        location: gigBody.gig.location,
        ticketsUrl: gigBody.gig.ticketsUrl,
        ...(photoUrl
          ? { photo: { url: photoUrl, externalUrl } }
          : externalUrl
            ? { photo: { externalUrl } }
            : {}),
      },
      isAdmin: gigBody.user?.isAdmin,
    };

    // TODO: add transaction?
    const savedGig = await this.gigService.saveGig(data.gig);
    const res = await this.telegramService.publishDraft(savedGig);
    // TODO: find the biggest photo and get its id
    const _data: any = {
      status: Status.Pending,
    };
    if (photoUrl || externalUrl) {
      _data.photo = {
        ...(photoUrl ? { url: photoUrl } : {}),
        ...(externalUrl ? { externalUrl } : {}),
        tgFileId: res?.photo?.[0]?.file_id,
      };
    }
    try {
      await this.gigService.updateGig(savedGig._id, _data);
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
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION;
    if (!bucket || !region) {
      throw new BadRequestException('S3_BUCKET or S3_REGION is not configured');
    }
    const key = `gigs/${randomUUID()}-${input.filename}`;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.buffer,
      ContentType: input.mimetype ?? 'application/octet-stream',
    });
    await this.s3.send(command);

    const base = this.getPublicBase(bucket, region);
    return `${base}/${key}`;
  }

  async listGigPhotos(): Promise<string[]> {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION;
    if (!bucket || !region) {
      throw new BadRequestException('S3_BUCKET or S3_REGION is not configured');
    }
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'gigs/',
    });
    const res = await this.s3.send(command);
    const base = this.getPublicBase(bucket, region);
    return (
      res.Contents?.map((o) => o.Key)
        .filter((k): k is string => Boolean(k))
        .map((k) => `${base}/${k}`) ?? []
    );
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
      // ignore parse errors, keep default
    }

    const res = await firstValueFrom(
      this.httpService.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 15_000,
      }),
    );
    const contentType =
      (res.headers['content-type'] as string | string[] | undefined) ||
      (res.headers['Content-Type'] as string | string[] | undefined);
    return {
      buffer: Buffer.from(res.data),
      filename,
      mimetype: Array.isArray(contentType) ? contentType[0] : contentType,
    };
  }

  private getPublicBase(bucket: string, region: string) {
    const explicit = process.env.S3_PUBLIC_BASE_URL;
    if (explicit) return explicit.replace(/\/$/, '');

    const endpoint = process.env.S3_ENDPOINT;
    const forcePathStyle = String(process.env.S3_FORCE_PATH_STYLE) === 'true';

    if (endpoint) {
      try {
        const url = new URL(endpoint);
        const host = url.host;
        if (forcePathStyle) {
          return `${url.protocol}//${host}/${bucket}`;
        }
        return `${url.protocol}//${bucket}.${host}`;
      } catch {
        // fall through to AWS-style
      }
    }

    return `https://${bucket}.s3.${region}.amazonaws.com`;
  }
}
