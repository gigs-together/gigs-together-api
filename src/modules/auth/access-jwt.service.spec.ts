import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenIdentityPayload } from '../../shared/types/access-token-identity.types';
import { AccessJwtService } from './access-jwt.service';

const ACCESS_SECRET = 'test-access-secret-at-least-32-chars!!';

function mockConfig(map: Record<string, string>): ConfigService {
  return {
    get: (key: string) => map[key],
  } as ConfigService;
}

function telegramIdentity(
  overrides: Partial<AccessTokenIdentityPayload> = {},
): AccessTokenIdentityPayload {
  return {
    kind: 'telegram',
    telegramUserId: 4242,
    snapshot: { firstName: 'Ada', isBot: false },
    ...overrides,
  };
}

describe('AccessJwtService', () => {
  let adminService: { isAdmin: ReturnType<typeof vi.fn> };
  let jwtService: JwtService;
  let config: ConfigService;
  let sut: AccessJwtService;

  beforeEach(() => {
    adminService = { isAdmin: vi.fn().mockResolvedValue(false) };
    config = mockConfig({
      JWT_SECRET: ACCESS_SECRET,
      JWT_ACCESS_EXPIRES_IN_SEC: '3600',
    });
    jwtService = new JwtService({
      secret: ACCESS_SECRET,
      signOptions: { expiresIn: 3_600, algorithm: 'HS256' },
    });
    sut = new AccessJwtService(jwtService, adminService as never, config);
  });

  it('getExpiresInSeconds matches auth-jwt-expires for access', () => {
    expect(sut.getExpiresInSeconds()).toBe(3_600);
  });

  it('signAccessToken then verifyAccessToken returns identity and isAdmin', async () => {
    adminService.isAdmin.mockResolvedValue(true);
    const identity = telegramIdentity();
    const token = await sut.signAccessToken(identity);
    const verified = await sut.verifyAccessToken(token);
    expect(verified.identity).toEqual(identity);
    expect(verified.isAdmin).toBe(true);
    expect(adminService.isAdmin).toHaveBeenCalledWith(4_242);
  });

  it('throws when JWT_SECRET is missing on sign', () => {
    const badConfig = mockConfig({});
    const service = new AccessJwtService(
      jwtService,
      adminService as never,
      badConfig,
    );
    return expect(service.signAccessToken(telegramIdentity())).rejects.toThrow(
      'JWT_SECRET is required',
    );
  });

  it('rejects token signed with a different secret', async () => {
    const otherSecret = 'other-access-secret-at-least-32-chars-x!!';
    const otherConfig = mockConfig({
      JWT_SECRET: otherSecret,
      JWT_ACCESS_EXPIRES_IN_SEC: '3600',
    });
    const otherJwt = new JwtService({
      secret: otherSecret,
      signOptions: { expiresIn: 3_600, algorithm: 'HS256' },
    });
    const otherSut = new AccessJwtService(
      otherJwt,
      adminService as never,
      otherConfig,
    );
    const token = await otherSut.signAccessToken(telegramIdentity());
    return expect(sut.verifyAccessToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects non-access typ', () => {
    const mockJwt = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn().mockResolvedValue({
        typ: 'refresh',
        sub: 'telegram:4242',
        identity: telegramIdentity(),
      }),
    } as unknown as JwtService;
    const service = new AccessJwtService(
      mockJwt,
      adminService as never,
      config,
    );
    return expect(service.verifyAccessToken('x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects tampered subject', () => {
    const mockJwt = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn().mockResolvedValue({
        typ: 'access',
        sub: 'telegram:99999',
        identity: telegramIdentity(),
      }),
    } as unknown as JwtService;
    const service = new AccessJwtService(
      mockJwt,
      adminService as never,
      config,
    );
    return expect(service.verifyAccessToken('x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when identity is missing or not an object', () => {
    const mockJwt = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn().mockResolvedValue({
        typ: 'access',
        sub: 'telegram:1',
        identity: null,
      }),
    } as unknown as JwtService;
    const service = new AccessJwtService(
      mockJwt,
      adminService as never,
      config,
    );
    return expect(service.verifyAccessToken('x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects unsupported identity kind in subject derivation', () => {
    const mockJwt = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn().mockResolvedValue({
        typ: 'access',
        sub: 'x',
        identity: { kind: 'oauth' },
      }),
    } as unknown as JwtService;
    const service = new AccessJwtService(
      mockJwt,
      adminService as never,
      config,
    );
    return expect(service.verifyAccessToken('x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects bot telegram snapshot', () => {
    const mockJwt = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn().mockResolvedValue({
        typ: 'access',
        sub: 'telegram:4242',
        identity: telegramIdentity({
          snapshot: { firstName: 'Bot', isBot: true },
        }),
      }),
    } as unknown as JwtService;
    const service = new AccessJwtService(
      mockJwt,
      adminService as never,
      config,
    );
    return expect(service.verifyAccessToken('x')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when verifyAsync fails', () => {
    const mockJwt = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn().mockRejectedValue(new Error('bad sig')),
    } as unknown as JwtService;
    const service = new AccessJwtService(
      mockJwt,
      adminService as never,
      config,
    );
    return expect(service.verifyAccessToken('x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
