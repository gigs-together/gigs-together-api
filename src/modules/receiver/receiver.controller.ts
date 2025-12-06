import {
  BadRequestException,
  Body,
  Controller,
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
import { AntiBotGuard } from './guards/anti-bot.guard';
import { ReceiverExceptionFilter } from './filters/receiver-exception.filter';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Controller('receiver')
@UseFilters(ReceiverExceptionFilter)
export class ReceiverController {
  constructor(private readonly receiverService: ReceiverService) {}

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
  @UseGuards(AntiBotGuard)
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

  @Version('1')
  @Get('gig/photos')
  // @UseGuards(AdminGuard)
  async listGigPhotos(): Promise<{ photos: string[] }> {
    const photos = await this.receiverService.listGigPhotos();
    return { photos };
  }
}
