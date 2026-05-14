import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import type { AppHealthResponse, AppRootResponse } from './app.types';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRoot(): AppRootResponse {
    return this.appService.getRoot();
  }

  @Get('health')
  async getHealth(): Promise<AppHealthResponse> {
    return this.appService.getHealth();
  }
}
