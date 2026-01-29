import { Module } from '@nestjs/common';
import { GigService } from './gig.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Gig, GigSchema } from './gig.schema';
import { GigController } from './gig.controller';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Gig.name, schema: GigSchema }]),
    AiModule,
    CalendarModule,
  ],
  providers: [GigService],
  exports: [GigService],
  controllers: [GigController],
})
export class GigModule {}
