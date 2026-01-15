import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { ReceiverService } from './receiver.service';
import { AdminGuard } from './guards/admin.guard';
import { TGUpdate } from '../telegram/types/update.types';
import { ReceiverExceptionFilter } from './filters/receiver-exception.filter';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TelegramService } from '../telegram/telegram.service';
import { AuthService } from '../auth/auth.service';
import type { TGUser, User } from '../telegram/types/user.types';
import type { V1ReceiverCreateGigRequestBody } from './requests/v1-receiver-create-gig-request';

@Controller('receiver')
@UseFilters(ReceiverExceptionFilter)
export class ReceiverController {
  constructor(
    private readonly receiverService: ReceiverService,
    private readonly telegramService: TelegramService,
    private readonly authService: AuthService,
  ) {}

  private async validateTelegramInitDataAndAttachUser(
    body: any,
  ): Promise<void> {
    const telegramInitDataString = String(
      (body as Partial<V1ReceiverCreateGigRequestBody>)
        ?.telegramInitDataString ?? '',
    );

    if (!telegramInitDataString) {
      throw new ForbiddenException('Missing Telegram user data');
    }

    try {
      const { parsedData, dataCheckString } =
        this.telegramService.parseTelegramInitDataString(
          telegramInitDataString,
        );
      this.telegramService.validateTelegramInitData(
        dataCheckString,
        parsedData.hash,
      );

      // Remove raw init data after validation so it won't be persisted/logged accidentally.
      delete body.telegramInitDataString;

      const tgUser: TGUser = JSON.parse(parsedData.user);

      // TODO: explicitly check if it's a user instead of if it's a bot
      if (tgUser?.is_bot) {
        throw new ForbiddenException('Bots are not allowed');
      }

      const isAdmin = await this.authService.isAdmin(tgUser.id);
      body.user = {
        tgUser,
        isAdmin,
      } as User;
    } catch (e) {
      // Keep the error stable for the client.
      throw new ForbiddenException('Invalid Telegram user data');
    }
  }

  @Version('1')
  @Post('webhook')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  async handleUpdate(@Body() update: TGUpdate): Promise<void> {
    if (update.callback_query) {
      await this.receiverService.handleCallbackQuery(update.callback_query);
      return;
    }
    await this.receiverService.handleMessage(update.message);
  }

  @Version('1')
  @Post('gig')
  @HttpCode(201)
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
    await this.validateTelegramInitDataAndAttachUser(body);
    await this.receiverService.handleGigSubmit(body, photoFile);
  }

  @Version('1')
  @Get('gig/photos')
  @UseGuards(AdminGuard)
  async listGigPhotos(): Promise<{ photos: string[] }> {
    const photos = await this.receiverService.listGigPhotos();
    return { photos };
  }
}
