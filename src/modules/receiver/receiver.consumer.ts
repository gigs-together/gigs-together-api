import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ConsumeMessage } from 'amqplib';
import { envBool } from '../../shared/utils/env';
import { MQService } from '../mq/mq.service';
import { ReceiverService } from './receiver.service';
import { CreateGigJobPayload } from './types/receiver.types';

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

@Injectable()
export class ReceiverConsumer implements OnModuleInit {
  private readonly logger = new Logger(ReceiverConsumer.name);

  constructor(
    private readonly mqService: MQService,
    private readonly receiverService: ReceiverService,
  ) {}

  async onModuleInit(): Promise<void> {
    const isEnabled = envBool('MQ_CONSUME_ENABLED', true);
    if (!isEnabled) {
      this.logger.warn('MQ consumer disabled (MQ_CONSUME_ENABLED=false)');
      return;
    }

    await this.mqService.assertQueue(this.receiverService.CREATE_GIG_QUEUE, {
      durable: true,
    });
    const channel = this.mqService.getChannel();

    await channel.consume(
      this.receiverService.CREATE_GIG_QUEUE,
      async (consumeMessage: ConsumeMessage | null) => {
        if (!consumeMessage) return;

        const bodyRaw = consumeMessage.content.toString('utf8');
        const parsed = safeJsonParse(bodyRaw);
        if (!parsed || typeof parsed !== 'object') {
          this.logger.warn(
            `Invalid createGig message (not an object). Dropping. body=${bodyRaw}`,
          );
          channel.ack(consumeMessage);
          return;
        }

        try {
          await this.receiverService.processCreateGigJob(
            parsed as CreateGigJobPayload,
          );
          channel.ack(consumeMessage);
        } catch (e) {
          this.logger.error(
            `createGig job failed (will requeue): ${String(e?.message ?? e)}`,
            e instanceof Error ? e.stack : undefined,
          );
          channel.nack(consumeMessage, false, true);
        }
      },
      { noAck: false },
    );

    this.logger.log(
      `Consuming queue "${this.receiverService.CREATE_GIG_QUEUE}"`,
    );
  }
}
