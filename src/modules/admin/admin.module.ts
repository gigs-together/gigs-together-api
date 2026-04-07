import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Admin, AdminSchema } from '../../shared/schemas/admin.schema';
import { AdminService } from './admin.service';
import { RequireAdminGuard } from './guards/require-admin.guard';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Admin.name, schema: AdminSchema }]),
  ],
  providers: [AdminService, RequireAdminGuard],
  exports: [AdminService, RequireAdminGuard],
})
export class AdminModule {}
