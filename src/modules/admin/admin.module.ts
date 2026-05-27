import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GigModule } from '../gig/gig.module';
import { LanguageModule } from '../language/language.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, GigModule, LanguageModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
