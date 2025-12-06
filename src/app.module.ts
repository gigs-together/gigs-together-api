import { Module, ConsoleLogger } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { GigModule } from './modules/gig/gig.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { AuthModule } from './modules/auth/auth.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { ReceiverModule } from './modules/receiver/receiver.module';

@Module({
  imports: [
    /* remember to read config async */
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    GigModule,
    TelegramModule,
    AuthModule,
    CalendarModule,
    ReceiverModule,
  ],
  controllers: [AppController],
  providers: [AppService, ConsoleLogger],
})
export class AppModule {}
