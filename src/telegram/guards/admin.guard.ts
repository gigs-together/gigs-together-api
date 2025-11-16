import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../../auth/auth.service';
import { TGUpdate } from '../types/update.types';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const update: TGUpdate = request.body;
    const telegramId =
      update?.message?.from?.id || update?.callback_query?.from?.id;

    const isAdmin = await this.authService.isAdmin(telegramId);
    if (isAdmin !== true) {
      throw new ForbiddenException('Access denied. Admin privileges required.');
    }

    return true;
  }
}
