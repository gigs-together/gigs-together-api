import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { getJwtExpiresInSeconds } from './auth-jwt-expires';
import { AccessJwtService } from './access-jwt.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Admin, AdminSchema } from '../../shared/schemas/admin.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Admin.name, schema: AdminSchema }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret?.trim()) {
          throw new Error('JWT_SECRET is required');
        }
        const expiresIn = getJwtExpiresInSeconds(configService);
        return {
          secret,
          signOptions: {
            expiresIn,
            algorithm: 'HS256',
          },
        };
      },
    }),
  ],
  providers: [AuthService, AccessJwtService],
  exports: [AuthService, AccessJwtService, JwtModule],
})
export class AuthModule {}
