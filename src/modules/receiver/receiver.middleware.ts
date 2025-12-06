import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from 'src/modules/auth/auth.service';
import { TelegramService } from '../telegram/telegram.service';
import { TGUser, User } from '../telegram/types/user.types';
import { V1ReceiverCreateGigRequestBody } from './requests/v1-receiver-create-gig-request';

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

@Injectable()
export class ReceiverCreateGigMiddleware implements NestMiddleware {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly authService: AuthService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { telegramInitDataString } =
      req.body as V1ReceiverCreateGigRequestBody;

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
