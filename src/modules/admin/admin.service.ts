import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../../shared/schemas/admin.schema';

/**
 * Admin list from MongoDB (cached). Used for JWT `isAdmin` and webhook checks.
 */
@Injectable()
export class AdminService {
  private adminsCache: AdminDocument[];
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(Admin.name) private readonly adminModel: Model<AdminDocument>,
  ) {}

  private async pullAdmins(): Promise<void> {
    const admins = await this.adminModel.find({ isActive: true }).exec();
    this.adminsCache = admins;
    this.logger.log(`Admins cache refreshed: ${admins.length} admin(s) found.`);
  }

  async isAdmin(telegramId: number): Promise<boolean> {
    if (!this.adminsCache) {
      await this.pullAdmins();
    }
    return this.adminsCache.some((admin) => admin.telegramId === telegramId);
  }
}
