import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class MQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MQService.name);

  // NOTE: `amqplib.connect()` is typed to return `ChannelModel` in our typings.
  // It behaves as the "connection" handle (createChannel/close/events).
  private connection!: amqp.ChannelModel;
  private channel!: amqp.Channel;

  private url = (process.env.MQ_URL ?? '').trim();
  private prefetch = Number(process.env.MQ_PREFETCH || 10);
  private isEnabled = this.url.length > 0;

  async onModuleInit() {
    if (!this.isEnabled) {
      this.logger.warn('MQ_URL is not set; MQ is disabled');
      return;
    }
    await this.connectWithRetry();
  }

  private async connectWithRetry() {
    for (;;) {
      try {
        this.connection = await amqp.connect(this.url);

        this.connection.on('error', (err) =>
          this.logger.error('Connection error', err),
        );
        this.connection.on('close', () => {
          this.logger.warn('Connection closed. Reconnecting...');
          // fire-and-forget
          this.connectWithRetry().catch((e) => this.logger.error(e));
        });

        this.channel = await this.connection.createChannel();
        await this.channel.prefetch(this.prefetch);

        this.logger.log(
          `MQ connected (${this.url}), prefetch=${this.prefetch}`,
        );
        return;
      } catch {
        this.logger.warn(`MQ connect failed. Retry in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  async assertQueue(
    queue: string,
    options: amqp.Options.AssertQueue = { durable: true },
  ) {
    if (!this.isEnabled) {
      throw new Error('MQ is disabled (MQ_URL is not set)');
    }
    return this.channel.assertQueue(queue, options);
  }

  async publishToQueue(
    queue: string,
    payload: unknown,
    options: amqp.Options.Publish = {},
  ) {
    if (!this.isEnabled) {
      throw new Error('MQ is disabled (MQ_URL is not set)');
    }
    await this.assertQueue(queue, { durable: true });

    const ok = this.channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true, contentType: 'application/json', ...options },
    );

    if (!ok) await new Promise((r) => this.channel.once('drain', r));
  }

  getChannel() {
    if (!this.isEnabled) {
      throw new Error('MQ is disabled (MQ_URL is not set)');
    }
    return this.channel;
  }

  async onModuleDestroy() {
    try {
      await this.channel?.close();
    } catch {}
    try {
      await this.connection?.close();
    } catch {}
  }
}
