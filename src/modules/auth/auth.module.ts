import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { getJwtAccessExpiresInSeconds } from './auth-jwt-expires';
import { AccessJwtService } from './access-jwt.service';
import { RefreshJwtService } from './refresh-jwt.service';
import { RequireAdminGuard } from './guards/require-admin.guard';
import { RequireAuthenticatedUserGuard } from './guards/require-authenticated-user.guard';
import { AuthCookiesService } from './auth-cookies.service';
import { AuthController } from './auth.controller';
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
        const expiresIn = getJwtAccessExpiresInSeconds(configService);
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
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessJwtService,
    RefreshJwtService,
    AuthCookiesService,
    RequireAuthenticatedUserGuard,
    RequireAdminGuard,
  ],
  exports: [
    AuthService,
    AccessJwtService,
    RefreshJwtService,
    AuthCookiesService,
    RequireAuthenticatedUserGuard,
    RequireAdminGuard,
    JwtModule,
  ],
})
export class AuthModule {}
