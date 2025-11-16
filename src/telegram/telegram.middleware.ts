import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TelegramService } from './telegram.service';
import { AuthService } from 'src/auth/auth.service';
import { V1TelegramCreateGigRequestBody } from './types/requests/v1-telegram-create-gig-request';
import { User, TGUser } from './types/user.types';

@Injectable()
export class TelegramMiddleware implements NestMiddleware {
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

@Injectable()
export class TelegramCreateGigMiddleware implements NestMiddleware {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly authService: AuthService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { telegramInitDataString } =
      req.body as V1TelegramCreateGigRequestBody;

    if (!telegramInitDataString) {
      throw new ForbiddenException('Missing Telegram user data');
    }

    try {
      const { parsedData, dataCheckString } =
        this.telegramService.parseTelegramInitDataString(
          telegramInitDataString,
        );
      this.telegramService.validateTelegramInitData(
        dataCheckString,
        parsedData.hash,
      );

      delete req.body.telegramInitDataString;
      const tgUser: TGUser = JSON.parse(parsedData.user);

      const isAdmin = await this.authService.isAdmin(tgUser.id);

      req.body.user = {
        tgUser,
        isAdmin,
      } as User;
    } catch (e) {
      throw new ForbiddenException(e);
    }

    next();
  }
}
