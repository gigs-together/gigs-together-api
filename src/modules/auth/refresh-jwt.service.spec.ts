import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenIdentityPayload } from '../../shared/types/access-token-identity.types';
import { RefreshJwtService } from './refresh-jwt.service';
import { subjectFromAccessIdentity } from './subject-from-access-identity';

const REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars!!';

function mockConfig(map: Record<string, string>): ConfigService {
  return {
    get: (key: string) => map[key],
  } as ConfigService;
}

function telegramIdentity(): AccessTokenIdentityPayload {
  return {
    kind: 'telegram',
    telegramUserId: 9001,
    snapshot: { firstName: 'Ryu', isBot: false },
  };
}

describe('RefreshJwtService', () => {
  let adminService: { isAdmin: ReturnType<typeof vi.fn> };
  let jwtService: JwtService;
  let config: ConfigService;
  let sut: RefreshJwtService;

  beforeEach(() => {
    adminService = { isAdmin: vi.fn().mockResolvedValue(false) };
    config = mockConfig({
      JWT_REFRESH_SECRET: REFRESH_SECRET,
      JWT_REFRESH_EXPIRES_IN_SEC: '86400',
    });
    jwtService = new JwtService({
      secret: REFRESH_SECRET,
      signOptions: { expiresIn: 86_400, algorithm: 'HS256' },
    });
    sut = new RefreshJwtService(jwtService, adminService as never, config);
  });

  it('getExpiresInSeconds matches auth-jwt-expires for refresh', () => {
    expect(sut.getExpiresInSeconds()).toBe(86_400);
  });

  it('signRefreshToken then verifyRefreshToken returns identity', async () => {
    const identity = telegramIdentity();
    const token = await sut.signRefreshToken(identity);
    const out = await sut.verifyRefreshToken(token);
    expect(out).toEqual(identity);
    expect(adminService.isAdmin).toHaveBeenCalledWith(9001);
  });

  it('throws when JWT_REFRESH_SECRET is missing on sign', () => {
    const badConfig = mockConfig({});
    const service = new RefreshJwtService(
      jwtService,
      adminService as never,
      badConfig,
    );
    return expect(service.signRefreshToken(telegramIdentity())).rejects.toThrow(
      'JWT_REFRESH_SECRET is required',
    );
  });

  it('rejects refresh-shaped token signed with a non-refresh secret', async () => {
    const wrongSecret = 'wrong-signing-secret-not-jwt-refresh-32chars!!';
    const wrongSigner = new JwtService({
      secret: wrongSecret,
      signOptions: { expiresIn: 86_400, algorithm: 'HS256' },
    });
    const identity = telegramIdentity();
    const sub = subjectFromAccessIdentity(identity);
    const token = await wrongSigner.signAsync(
      { typ: 'refresh', sub, identity },
      {
        secret: wrongSecret,
        expiresIn: 86_400,
        algorithm: 'HS256',
      },
    );
    return expect(sut.verifyRefreshToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects non-refresh typ', () => {
    const mockJwt = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn().mockResolvedValue({
        typ: 'access',
        sub: 'telegram:9001',
        identity: telegramIdentity(),
      }),
    } as unknown as JwtService;
    const service = new RefreshJwtService(
      mockJwt,
      adminService as never,
      config,
    );
    return expect(service.verifyRefreshToken('x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects tampered subject', () => {
    const mockJwt = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn().mockResolvedValue({
        typ: 'refresh',
        sub: 'telegram:1',
        identity: telegramIdentity(),
      }),
    } as unknown as JwtService;
    const service = new RefreshJwtService(
      mockJwt,
      adminService as never,
      config,
    );
    return expect(service.verifyRefreshToken('x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects bot telegram snapshot', () => {
    const mockJwt = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn().mockResolvedValue({
        typ: 'refresh',
        sub: 'telegram:9001',
        identity: {
          kind: 'telegram',
          telegramUserId: 9001,
          snapshot: { firstName: 'B', isBot: true },
        },
      }),
    } as unknown as JwtService;
    const service = new RefreshJwtService(
      mockJwt,
      adminService as never,
      config,
    );
    return expect(service.verifyRefreshToken('x')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects unsupported refresh identity kind', () => {
    const mockJwt = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn().mockResolvedValue({
        typ: 'refresh',
        sub: 'x',
        identity: { kind: 'oauth' },
      }),
    } as unknown as JwtService;
    const service = new RefreshJwtService(
      mockJwt,
      adminService as never,
      config,
    );
    return expect(service.verifyRefreshToken('x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
