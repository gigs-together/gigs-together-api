import { Module } from '@nestjs/common';
import { GigService } from './gig.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Gig, GigSchema } from './gig.schema';
import { GigController } from './gig.controller';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { BucketModule } from '../bucket/bucket.module';
import { HttpModule } from '@nestjs/axios';
import { GigPosterService } from './gig.poster.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Gig.name, schema: GigSchema }]),
    AiModule,
    CalendarModule,
    BucketModule,
    HttpModule,
    TelegramModule,
  ],
  providers: [GigService, GigPosterService],
  exports: [GigService],
  controllers: [GigController],
})
export class GigModule {}
