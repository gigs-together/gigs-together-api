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

function toShortJson(value: unknown, maxLen = 2000): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string')
    return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
  try {
    const s = JSON.stringify(value);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : value;
  } catch {
    return '[unserializable]';
  }
}

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
      // Never log the raw AxiosError object — it may include huge internals and secrets in baseURL/headers.
      this.logger.error(
        {
          note: 'Upstream Axios request failed',
          request: {
            path: request.url,
            method: request.method,
          },
          upstream: {
            code: exception.code,
            status: exception.response?.status ?? null,
            message: exception.message,
            request: {
              method: exception.config?.method,
              url: exception.config?.url,
              timeout: exception.config?.timeout,
              params: toShortJson(exception.config?.params),
            },
            response: {
              data: toShortJson(exception.response?.data ?? null),
            },
          },
          timestamp: new Date().toISOString(),
        },
        undefined,
        GlobalExceptionFilter.name,
      );

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
