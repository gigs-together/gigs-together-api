import { Module } from '@nestjs/common';
import { AiLookupDevStubService } from './ai-lookup-dev-stub.service';
import { AiService } from './ai.service';

@Module({
  providers: [AiService, AiLookupDevStubService],
  exports: [AiService],
})
export class AiModule {}
