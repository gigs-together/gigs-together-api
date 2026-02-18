import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRoot(): { ok: true; service: string } {
    return this.appService.getRoot();
  }

  @Get('health')
  getHealth(): { ok: true } {
    return this.appService.getHealth();
  }
}
