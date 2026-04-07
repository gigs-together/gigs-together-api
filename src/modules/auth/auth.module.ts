import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getJwtAccessExpiresInSeconds } from './auth-jwt-expires';
import { AccessJwtService } from './access-jwt.service';
import { RefreshJwtService } from './refresh-jwt.service';
import { AccessJwtAuthGuard } from './guards/access-jwt-auth.guard';
import { RequireAuthenticatedUserGuard } from './guards/require-authenticated-user.guard';
import { AuthCookiesService } from './auth-cookies.service';
import { AuthController } from './auth.controller';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    AdminModule,
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
    AccessJwtService,
    RefreshJwtService,
    AuthCookiesService,
    AccessJwtAuthGuard,
    RequireAuthenticatedUserGuard,
  ],
  exports: [
    AdminModule,
    AccessJwtService,
    RefreshJwtService,
    AuthCookiesService,
    AccessJwtAuthGuard,
    RequireAuthenticatedUserGuard,
    JwtModule,
  ],
})
export class AuthModule {}
