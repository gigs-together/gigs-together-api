import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
// import { NodeHttpHandler } from '@smithy/node-http-handler';

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
  private readonly photosCacheTtlMs = 60_000;
  private photosCache?: { at: number; value: string[] };
  private photosInFlight?: Promise<string[]>;
  private lastListPhotosErrorLogAt?: number;
  private readonly s3 = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    // Boolean("false") === true — so parse explicitly
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE) === 'true',
    // requestHandler: new NodeHttpHandler({
    //   connectionTimeout: Number(process.env.S3_CONNECTION_TIMEOUT_MS ?? 3_000),
    //   socketTimeout: Number(process.env.S3_SOCKET_TIMEOUT_MS ?? 10_000),
    // }),
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
      // TODO: also look by photo equality
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

    // Bucket is private on Railway. Store a stable, publicly reachable URL on our API
    // which either redirects to a presigned URL or proxies bytes.
    return this.getPublicFileProxyUrl(key);
  }

  async listGigPhotos(): Promise<string[]> {
    const now = Date.now();
    if (this.photosCache && now - this.photosCache.at < this.photosCacheTtlMs) {
      return this.photosCache.value;
    }
    if (this.photosInFlight) {
      return this.photosInFlight;
    }

    this.photosInFlight = this.listGigPhotosUncached()
      .then((value) => {
        this.photosCache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        this.photosInFlight = undefined;
      });

    return this.photosInFlight;
  }

  private async listGigPhotosUncached(): Promise<string[]> {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION;
    if (!bucket || !region) {
      throw new BadRequestException('S3_BUCKET or S3_REGION is not configured');
    }

    const expiresIn = this.normalizePresignExpiresIn(
      Number(process.env.S3_PRESIGN_EXPIRES_IN ?? 3600),
    );
    const listTimeoutMs = Number(process.env.S3_LIST_TIMEOUT_MS ?? 5_000);

    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'gigs/',
      // Avoid giant listings; this endpoint is for the homepage gallery.
      MaxKeys: 200,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), listTimeoutMs);
    let res: any | undefined;
    try {
      res = (await this.s3.send(command, {
        abortSignal: controller.signal,
      })) as any;
    } catch (e) {
      // Never crash the homepage on S3 issues; return cache (even stale) or empty.
      const now = Date.now();
      if (
        !this.lastListPhotosErrorLogAt ||
        now - this.lastListPhotosErrorLogAt > 60_000
      ) {
        this.lastListPhotosErrorLogAt = now;
        this.logger.warn(
          `listGigPhotos failed: ${JSON.stringify((e as any)?.name ?? (e as any)?.message ?? e)}`,
        );
      }
      return this.photosCache?.value ?? [];
    } finally {
      clearTimeout(timeout);
    }

    const keys =
      res?.Contents?.map((o: any) => o.Key)
        .filter((k): k is string => Boolean(k))
        .filter((k) => !k.endsWith('/')) ?? [];

    // Private bucket: return presigned GET URLs so the client can load images.
    return await Promise.all(
      keys.map((Key) =>
        this.presignGetObjectUrl({ bucket, key: Key, expiresIn }),
      ),
    );
  }

  private normalizePresignExpiresIn(expiresIn: number): number {
    // AWS SigV4 presign supports up to 7 days for many services; keep it sane.
    if (!Number.isFinite(expiresIn)) return 3600;
    if (expiresIn < 60) return 60;
    if (expiresIn > 604800) return 604800;
    return Math.floor(expiresIn);
  }

  private encodeS3KeyForPath(key: string): string {
    // Keep "/" separators but encode each segment.
    return key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  private async presignGetObjectUrl(input: {
    bucket: string;
    key: string;
    expiresIn: number;
  }): Promise<string> {
    const { bucket, key, expiresIn } = input;
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    // Use the official AWS SDK v3 presigner so endpoint + path-style/virtual-host
    // are handled correctly for S3-compatible providers like Railway Buckets.
    return await getSignedUrl(this.s3 as any, command as any, { expiresIn });
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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
      console.error('parse error');
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

  private ensureGigPhotoKey(key: string): string {
    const trimmed = key?.trim?.() ?? key;
    if (!trimmed) {
      throw new BadRequestException('key is required');
    }
    // Avoid exposing arbitrary objects; homepage uses gigs/* only.
    if (!trimmed.startsWith('gigs/')) {
      throw new NotFoundException();
    }
    // Hardening: avoid weird traversal-ish keys.
    if (trimmed.includes('..')) {
      throw new NotFoundException();
    }
    return trimmed;
  }

  private getApiPublicBase(): string {
    const explicit =
      process.env.APP_PUBLIC_BASE_URL ?? process.env.PUBLIC_BASE_URL;
    if (explicit) return explicit.replace(/\/$/, '');
    // Fallback: relative URLs still work for same-origin clients.
    return '';
  }

  private getPublicFileProxyUrl(key: string): string {
    const safeKey = this.ensureGigPhotoKey(key);
    const base = this.getApiPublicBase();
    // encode each segment, keep slashes
    const encoded = this.encodeS3KeyForPath(safeKey);
    return `${base}/public/files-proxy/${encoded}`;
  }

  async getPresignedGigPhotoUrlByKey(key: string): Promise<string> {
    const safeKey = this.ensureGigPhotoKey(key);
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION;
    if (!bucket || !region) {
      throw new BadRequestException('S3_BUCKET or S3_REGION is not configured');
    }
    const expiresIn = this.normalizePresignExpiresIn(
      Number(process.env.S3_PRESIGN_EXPIRES_IN ?? 3600),
    );
    return this.presignGetObjectUrl({ bucket, key: safeKey, expiresIn });
  }

  async getGigPhotoObjectByKey(key: string) {
    const safeKey = this.ensureGigPhotoKey(key);
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new BadRequestException('S3_BUCKET is not configured');
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: safeKey,
    });
    return await this.s3.send(command);
  }

  async readS3BodyToBuffer(body: any): Promise<Buffer> {
    if (!body) return Buffer.alloc(0);
    if (Buffer.isBuffer(body)) return body;
    if (typeof body?.transformToByteArray === 'function') {
      const arr = await body.transformToByteArray();
      return Buffer.from(arr);
    }
    if (typeof body?.arrayBuffer === 'function') {
      const ab = await body.arrayBuffer();
      return Buffer.from(ab);
    }
    // Node Readable
    if (typeof body?.on === 'function') {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        body.on('data', (chunk: Buffer) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        body.on('end', () => resolve());
        body.on('error', (e: any) => reject(e));
      });
      return Buffer.concat(chunks);
    }
    return Buffer.from(String(body));
  }
}
