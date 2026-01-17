import {
  ArgumentsHost,
  Catch,
  ConsoleLogger,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Telegram webhook MUST always respond 200, otherwise Telegram retries.
 *
 * This filter is intended to be applied on the webhook route only.
 */
@Catch()
@Injectable()
export class ReceiverWebhookExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: ConsoleLogger) {
    this.logger.setContext(ReceiverWebhookExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusForLog =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const messageForLog =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // Keep logs, but never trigger Telegram retries.
    this.logger.error(
      `Telegram webhook error suppressed (responding 200): ${JSON.stringify({
        statusCode: statusForLog,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        message:
          typeof messageForLog === 'string'
            ? messageForLog
            : (messageForLog as { message: string }).message ||
              'An error occurred',
      })}`,
      exception instanceof Error ? exception.stack : undefined,
      ReceiverWebhookExceptionFilter.name,
    );

    response.status(200).send();
  }
}
