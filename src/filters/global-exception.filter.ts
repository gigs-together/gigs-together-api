import {
  ArgumentsHost,
  Catch,
  ConsoleLogger,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { isAxiosError } from 'axios';
import type { Request, Response } from 'express';
import { logError } from '../shared/utils/logging';

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: ConsoleLogger) {
    this.logger.setContext(GlobalExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (isAxiosError(exception)) {
      logError(this.logger, {
        error: exception,
        note: 'Upstream Axios request failed',
        context: GlobalExceptionFilter.name,
        meta: {
          request: {
            path: request.url,
            method: request.method,
          },
        },
      });

      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        message: 'Internal server error',
      });
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message:
        typeof message === 'string'
          ? message
          : (message as { message?: string }).message || 'An error occurred',
      ...(typeof message === 'object' && !(message instanceof Error)
        ? message
        : {}),
    };

    // Keep logs readable: only message + stack (no giant object dumps).
    this.logger.error(
      errorResponse,
      exception instanceof Error ? exception.stack : undefined,
      GlobalExceptionFilter.name,
    );

    return response.status(status).json(errorResponse);
  }
}
