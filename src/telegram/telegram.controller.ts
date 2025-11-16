import {
  Controller,
  HttpCode,
  Post,
  UseGuards,
  Body,
  Version,
} from '@nestjs/common';
import { AntiBotGuard } from './guards/anti-bot.guard';
import { GigService } from '../gig/gig.service';
import { V1TelegramCreateGigRequestBodyValidated } from './dto/requests/v1-telegram-create-gig-request';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly gigService: GigService) {}

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
    await this.gigService.handleGigSubmit(mappedData);
  }
}
