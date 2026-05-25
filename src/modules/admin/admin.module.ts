import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RequireAdminGuard } from './guards/require-admin.guard';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, RequireAdminGuard],
  exports: [AdminService, RequireAdminGuard],
})
export class AdminModule {}
