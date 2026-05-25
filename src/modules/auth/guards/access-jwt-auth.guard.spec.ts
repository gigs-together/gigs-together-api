import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthService } from '../auth.service';
import { AccessJwtAuthGuard } from './access-jwt-auth.guard';

type RequestWithCookies = Request & {
  cookies?: Record<string, string | undefined>;
};

function asRequestWithCookies(partial: {
  cookies: Record<string, string | undefined>;
}): RequestWithCookies {
  return partial as unknown as RequestWithCookies;
}

function httpContext(req: RequestWithCookies): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as ExecutionContext;
}

describe('AccessJwtAuthGuard', () => {
  let authService: {
    verifyAccessToken: ReturnType<typeof vi.fn>;
    getAccessCookieName: ReturnType<typeof vi.fn>;
  };
  let guard: AccessJwtAuthGuard;

  beforeEach(() => {
    authService = {
      verifyAccessToken: vi.fn(),
      getAccessCookieName: vi.fn().mockReturnValue('gt_access'),
    };
    guard = new AccessJwtAuthGuard(authService as unknown as AuthService);
  });

  it('returns true and does not verify when cookie is absent', async () => {
    const req = asRequestWithCookies({ cookies: {} });
    const ok = await guard.canActivate(httpContext(req));
    expect(ok).toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('returns true and does not verify when cookie is whitespace only', async () => {
    const req = asRequestWithCookies({ cookies: { gt_access: '   ' } });
    const ok = await guard.canActivate(httpContext(req));
    expect(ok).toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('verifies and sets req.user when cookie is present', async () => {
    authService.verifyAccessToken.mockResolvedValue({
      identity: {
        kind: 'telegram',
        telegramUserId: 1,
        snapshot: { firstName: 'A' },
      },
      isAdmin: true,
    });
    const req = asRequestWithCookies({ cookies: { gt_access: 'jwt-here' } });
    const ok = await guard.canActivate(httpContext(req));
    expect(ok).toBe(true);
    expect(authService.verifyAccessToken).toHaveBeenCalledWith('jwt-here');
    expect(req.user).toEqual({
      tgUser: expect.objectContaining({ id: 1, first_name: 'A' }),
      isAdmin: true,
    });
  });
});
