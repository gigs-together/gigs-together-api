import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Patch,
  Post,
  Param,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { ReceiverService } from './receiver.service';
import { TGUpdate } from '../telegram/types/update.types';
import { ReceiverExceptionFilter } from './filters/receiver-exception.filter';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ReceiverWebhookGuard } from './guards/receiver-webhook.guard';
import { AccessJwtAuthGuard } from '../telegram/guards/access-jwt-auth.guard';
import { TelegramInitDataAuthGuard } from '../telegram/guards/telegram-init-data-auth.guard';
import { ReceiverWebhookExceptionFilter } from './filters/receiver-webhook-exception.filter';
import type { ReceiverWebhookRequest } from './guards/receiver-webhook.guard';
import { GigBodyPipe } from './pipes/gig-body.pipe';
import { TelegramInitDataUserPipe } from '../telegram/pipes/telegram-init-data-user.pipe';
import { RequireTelegramAdminPipe } from '../telegram/pipes/require-telegram-admin.pipe';
import { V1ReceiverCreateGigRequestBodyValidated } from './types/requests/v1-receiver-create-gig-request';
import type { V1ReceiverUpdateGigByPublicIdResponseBody } from './types/requests/v1-receiver-gig-by-public-id-request';

const PosterFileInterceptor = FileInterceptor('posterFile', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) {
      return cb(new BadRequestException('posterFile must be an image'), false);
    }
    cb(null, true);
  },
});

@Controller('receiver')
@UseFilters(ReceiverExceptionFilter)
export class ReceiverController {
  constructor(private readonly receiverService: ReceiverService) {}

  @Version('1')
  @Post('webhook')
  @HttpCode(200)
  @UseFilters(ReceiverWebhookExceptionFilter)
  @UseGuards(ReceiverWebhookGuard)
  handleUpdate(
    @Req() req: ReceiverWebhookRequest,
    @Body() update: TGUpdate,
  ): Promise<void> {
    // Telegram must always receive 200, but we still want to process updates only from admins.
    // TelegramWebhookGuard marks request.telegramWebhook.allowed; when denied we just no-op.
    // (No throwing here — avoid 4xx which triggers Telegram retries.)
    if (req.telegramWebhook?.allowed !== true) {
      return;
    }

    if (update.callback_query) {
      return this.receiverService.handleCallbackQuery(update.callback_query);
    }
    return this.receiverService.handleMessage(update.message);
  }

  @Version('1')
  @Post('gig')
  @HttpCode(201)
  @UseGuards(AccessJwtAuthGuard, TelegramInitDataAuthGuard)
  @UseInterceptors(PosterFileInterceptor)
  createGig(
    @UploadedFile() posterFile: Express.Multer.File | undefined,
    @Body(TelegramInitDataUserPipe, GigBodyPipe)
    body: V1ReceiverCreateGigRequestBodyValidated,
    // JSON object (application/json) or strings (multipart/form-data)
  ): Promise<void> {
    return this.receiverService.handleGigSubmit(body, posterFile);
  }

  @Version('1')
  @Patch('gig/:publicId')
  @HttpCode(200)
  @UseGuards(AccessJwtAuthGuard, TelegramInitDataAuthGuard)
  @UseInterceptors(PosterFileInterceptor)
  updateGigByPublicId(
    @Param('publicId') publicId: string,
    @UploadedFile() posterFile: Express.Multer.File | undefined,
    @Body(TelegramInitDataUserPipe, RequireTelegramAdminPipe, GigBodyPipe)
    body: V1ReceiverCreateGigRequestBodyValidated,
  ): Promise<V1ReceiverUpdateGigByPublicIdResponseBody> {
    return this.receiverService.updateGigByPublicId({
      publicId,
      body,
      posterFile,
    });
  }
}
