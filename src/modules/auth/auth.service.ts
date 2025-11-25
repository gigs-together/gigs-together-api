import { Injectable } from '@nestjs/common';
import { Admin, AdminDocument } from '../../shared/schemas/admin.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class AuthService {
  private adminsCache: AdminDocument[];

  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
  ) {}

  private async pullAdmins(): Promise<void> {
    const admins = await this.adminModel.find({ isActive: true }).exec();
    this.adminsCache = admins;
    console.log(`Admins cache refreshed: ${admins.length} admin(s) found.`);
  }

  async isAdmin(telegramId: number): Promise<boolean> {
    if (!this.adminsCache) {
      await this.pullAdmins();
    }
    return this.adminsCache.some((admin) => admin.telegramId === telegramId);
  }
}
