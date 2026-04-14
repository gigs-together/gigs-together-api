import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessJwtService } from '../access-jwt.service';
import type { AuthCookiesService } from '../auth-cookies.service';
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
  let accessJwt: { verifyAccessToken: ReturnType<typeof vi.fn> };
  let cookies: { getAccessCookieName: ReturnType<typeof vi.fn> };
  let guard: AccessJwtAuthGuard;

  beforeEach(() => {
    accessJwt = { verifyAccessToken: vi.fn() };
    cookies = { getAccessCookieName: vi.fn().mockReturnValue('gt_access') };
    guard = new AccessJwtAuthGuard(
      accessJwt as unknown as AccessJwtService,
      cookies as unknown as AuthCookiesService,
    );
  });

  it('returns true and does not verify when cookie is absent', async () => {
    const req = asRequestWithCookies({ cookies: {} });
    const ok = await guard.canActivate(httpContext(req));
    expect(ok).toBe(true);
    expect(accessJwt.verifyAccessToken).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('returns true and does not verify when cookie is whitespace only', async () => {
    const req = asRequestWithCookies({ cookies: { gt_access: '   ' } });
    const ok = await guard.canActivate(httpContext(req));
    expect(ok).toBe(true);
    expect(accessJwt.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('verifies and sets req.user when cookie is present', async () => {
    accessJwt.verifyAccessToken.mockResolvedValue({
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
    expect(accessJwt.verifyAccessToken).toHaveBeenCalledWith('jwt-here');
    expect(req.user).toEqual({
      tgUser: expect.objectContaining({ id: 1, first_name: 'A' }),
      isAdmin: true,
    });
  });
});
