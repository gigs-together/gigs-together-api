import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { TGUpdate } from './types/update.types';
import { TelegramService } from './telegram.service';
import { AdminGuard } from './guards/admin.guard';
import { AntiBotGuard } from './guards/anti-bot.guard';
import { V1TelegramCreateGigRequestBodyValidated } from './types/requests/v1-telegram-create-gig-request';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('webhook')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  async handleUpdate(@Body() update: TGUpdate): Promise<void> {
    if (update.callback_query) {
      await this.telegramService.handleCallbackQuery(update.callback_query);
      return;
    }
    // await this.telegramService.handleMessage(update.message);
  }

  @Version('1')
  @Post('gig')
  @HttpCode(201)
  @UseGuards(AntiBotGuard)
  async createGig(
    @Body() data: V1TelegramCreateGigRequestBodyValidated,
  ): Promise<void> {
    // TODO: validate the data still
    const mappedData = {
      gig: {
        title: data.gig.title,
        date: data.gig.date,
        location: data.gig.location,
        ticketsUrl: data.gig.ticketsUrl,
      },
      isAdmin: data.user?.isAdmin,
    };
    await this.telegramService.handleGigSubmit(mappedData);
  }
}
