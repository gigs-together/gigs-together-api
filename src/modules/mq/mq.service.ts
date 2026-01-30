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

  private conn!: amqp.Connection;
  private ch!: amqp.Channel;

  private url = (process.env.MQ_URL ?? '').trim();
  private prefetch = Number(process.env.MQ_PREFETCH || 10);
  private enabled = this.url.length > 0;

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('MQ_URL is not set; MQ is disabled');
      return;
    }
    await this.connectWithRetry();
  }

  private async connectWithRetry() {
    for (;;) {
      try {
        this.conn = await amqp.connect(this.url);

        this.conn.on('error', (err) =>
          this.logger.error('Connection error', err),
        );
        this.conn.on('close', () => {
          this.logger.warn('Connection closed. Reconnecting...');
          // fire-and-forget: Nest не ждёт, но мы переподнимем канал
          this.connectWithRetry().catch((e) => this.logger.error(e));
        });

        this.ch = await this.conn.createChannel();
        await this.ch.prefetch(this.prefetch);

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
    if (!this.enabled) {
      throw new Error('MQ is disabled (MQ_URL is not set)');
    }
    return this.ch.assertQueue(queue, options);
  }

  async publishToQueue(
    queue: string,
    payload: unknown,
    options: amqp.Options.Publish = {},
  ) {
    if (!this.enabled) {
      throw new Error('MQ is disabled (MQ_URL is not set)');
    }
    await this.assertQueue(queue, { durable: true });

    const ok = this.ch.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true, contentType: 'application/json', ...options },
    );

    // backpressure: если вернул false, канал просит подождать drain
    if (!ok) await new Promise((r) => this.ch.once('drain', r));
  }

  getChannel() {
    if (!this.enabled) {
      throw new Error('MQ is disabled (MQ_URL is not set)');
    }
    return this.ch;
  }

  async onModuleDestroy() {
    try {
      await this.ch?.close();
    } catch {}
    try {
      await this.conn?.close();
    } catch {}
  }
}
