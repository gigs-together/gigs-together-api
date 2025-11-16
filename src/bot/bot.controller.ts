import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { UpdateDto } from './dto/update.dto';
import { BotService } from './bot.service';
import { AdminGuard } from './guards/admin.guard';
import { AntiBotGuard } from './guards/anti-bot.guard';
import { V1TelegramCreateGigRequestBodyValidated } from './dto/requests/v1-telegram-create-gig-request';

@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post('webhook')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  async handleUpdate(@Body() update: UpdateDto): Promise<void> {
    if (update.callback_query) {
      await this.botService.handleCallbackQuery(update.callback_query);
      return;
    }
    // await this.botService.handleMessage(update.message);
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
    await this.botService.handleGigSubmit(mappedData);
  }
}
