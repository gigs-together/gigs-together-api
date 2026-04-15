import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AiLookupNotFoundException } from '../exceptions/ai-lookup-not-found.exception';

@Catch(AiLookupNotFoundException)
export class AiLookupNotFoundFilter implements ExceptionFilter {
  catch(exception: AiLookupNotFoundException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const message = exception.getResponse();

    response.status(HttpStatus.NOT_FOUND).json({
      statusCode: HttpStatus.NOT_FOUND,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message:
        typeof message === 'string'
          ? message
          : (message as { message?: string }).message || 'Future gig not found',
      ...(typeof message === 'object' && !(message instanceof Error)
        ? message
        : {}),
    });
  }
}
