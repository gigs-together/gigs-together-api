import { Body, Controller, Post, Version } from '@nestjs/common';
import { AiService } from './ai.service';
import type { V1AiGenerateResponseBody } from './types/requests/v1-ai-generate-request';
import { V1AiGenerateRequestBody } from './types/requests/v1-ai-generate-request';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Version('1')
  @Post()
  generateV1(
    @Body() body: V1AiGenerateRequestBody,
  ): Promise<V1AiGenerateResponseBody> {
    return this.aiService.generateV1(body);
  }
}
