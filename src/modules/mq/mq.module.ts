import { Global, Module } from '@nestjs/common';
import { MQService } from './mq.service';

@Global()
@Module({
  providers: [MQService],
  exports: [MQService],
})
export class MqModule {}
