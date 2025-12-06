import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { ReceiverService } from './receiver.service';
import { AdminGuard } from './guards/admin.guard';
import { TGUpdate } from '../telegram/types/update.types';
import { AntiBotGuard } from './guards/anti-bot.guard';
import { V1ReceiverCreateGigRequestBodyValidated } from './requests/v1-receiver-create-gig-request';

@Controller('receiver')
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
  async createGig(
    @Body() data: V1ReceiverCreateGigRequestBodyValidated,
  ): Promise<void> {
    // TODO: validate the data still
    const mappedData = {
      gig: {
        title: data.gig.title,
        date: data.gig.date,
        location: data.gig.location,
        ticketsUrl: data.gig.ticketsUrl,
        photo: { url: data.gig.photo },
      },
      isAdmin: data.user?.isAdmin,
    };
    await this.receiverService.handleGigSubmit(mappedData);
  }
}

