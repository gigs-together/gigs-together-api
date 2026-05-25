import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Admin, AdminSchema } from '../../shared/schemas/admin.schema';
import { getJwtAccessExpiresInSeconds } from './auth-jwt-expires';
import { AccessJwtService } from './access-jwt.service';
import { RefreshJwtService } from './refresh-jwt.service';
import { AccessJwtAuthGuard } from './guards/access-jwt-auth.guard';
import { AuthenticatedUserGuard } from './guards/authenticated-user.guard';
import { AuthCookiesService } from './auth-cookies.service';
import { AuthController } from './auth.controller';
import { AuthorizationService } from './authorization.service';

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
    AuthorizationService,
    AccessJwtService,
    RefreshJwtService,
    AuthCookiesService,
    AccessJwtAuthGuard,
    AuthenticatedUserGuard,
  ],
  exports: [
    AuthorizationService,
    AccessJwtService,
    RefreshJwtService,
    AuthCookiesService,
    AccessJwtAuthGuard,
    AuthenticatedUserGuard,
    JwtModule,
  ],
})
export class AuthModule {}
