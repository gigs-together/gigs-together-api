import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ReceiverMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const secretHeader = req.headers[
      'x-telegram-bot-api-secret-token'
    ] as string;

    if (secretHeader !== process.env.BOT_SECRET) {
      throw new ForbiddenException('Invalid secret token');
    }

    next();
  }
}
