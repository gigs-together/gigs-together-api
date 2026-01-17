import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  Version,
} from '@nestjs/common';
import { ReceiverService } from './receiver.service';
import { TGUpdate } from '../telegram/types/update.types';
import { ReceiverExceptionFilter } from './filters/receiver-exception.filter';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ReceiverWebhookGuard } from './guards/receiver-webhook.guard';
import { ReceiverWebhookExceptionFilter } from './filters/receiver-webhook-exception.filter';
import type { ReceiverWebhookRequest } from './guards/receiver-webhook.guard';
import { TelegramInitDataPipe } from './pipes/telegram-init-data.pipe';

@Controller('receiver')
@UseFilters(ReceiverExceptionFilter)
export class ReceiverController {
  constructor(private readonly receiverService: ReceiverService) {}

  @Version('1')
  @Post('webhook')
  @HttpCode(200)
  @UseFilters(ReceiverWebhookExceptionFilter)
  @UseGuards(ReceiverWebhookGuard)
  async handleUpdate(
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
      await this.receiverService.handleCallbackQuery(update.callback_query);
      return;
    }
    await this.receiverService.handleMessage(update.message);
  }

  @Version('1')
  @Post('gig')
  @HttpCode(201)
  @UsePipes(TelegramInitDataPipe)
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype?.startsWith('image/')) {
          return cb(new BadRequestException('photo must be an image'), false);
        }
        cb(null, true);
      },
    }),
  )
  async createGig(
    @UploadedFile() photoFile: Express.Multer.File | undefined,
    @Body() body: any, // JSON object (application/json) or strings (multipart/form-data)
  ): Promise<void> {
    await this.receiverService.handleGigSubmit(body, photoFile);
  }
}
