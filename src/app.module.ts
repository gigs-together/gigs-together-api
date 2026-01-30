import { Module, ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
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
import { BucketModule } from './modules/bucket/bucket.module';
import { AiModule } from './modules/ai/ai.module';
import { MqModule } from './modules/mq/mq.module';

const nodeEnv = (process.env.NODE_ENV ?? 'dev').trim();
const envFilePath = [`.env.${nodeEnv}`, '.env'];

@Module({
  imports: [
    /* remember to read config async */
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath,
      cache: true,
      expandVariables: true,
    }),
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
    BucketModule,
    AiModule,
    MqModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ConsoleLogger,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidUnknownValues: false,
      }),
    },
  ],
})
export class AppModule {}
