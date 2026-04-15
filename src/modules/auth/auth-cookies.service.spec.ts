import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthCookiesService } from './auth-cookies.service';

function mockConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('AuthCookiesService', () => {
  it('defaults access cookie name to gt_access', () => {
    const sut = new AuthCookiesService(mockConfig({}));
    expect(sut.getAccessCookieName()).toBe('gt_access');
  });

  it('defaults refresh cookie name to gt_refresh', () => {
    const sut = new AuthCookiesService(mockConfig({}));
    expect(sut.getRefreshCookieName()).toBe('gt_refresh');
  });

  it('uses trimmed custom cookie names from env', () => {
    const sut = new AuthCookiesService(
      mockConfig({
        ACCESS_TOKEN_COOKIE_NAME: '  my_access  ',
        REFRESH_TOKEN_COOKIE_NAME: 'my_refresh',
      }),
    );
    expect(sut.getAccessCookieName()).toBe('my_access');
    expect(sut.getRefreshCookieName()).toBe('my_refresh');
  });

  it('setAccessTokenCookie sets maxAge from expiresInSec (seconds → ms)', () => {
    const sut = new AuthCookiesService(mockConfig({ NODE_ENV: 'dev' }));
    const res = { cookie: vi.fn() } as unknown as Response;
    sut.setAccessTokenCookie(res, 'tok', 120);
    expect(res.cookie).toHaveBeenCalledWith(
      'gt_access',
      'tok',
      expect.objectContaining({
        httpOnly: true,
        maxAge: 120_000,
        path: '/',
      }),
    );
  });

  it('clearAccessTokenCookie clears with maxAge 0', () => {
    const sut = new AuthCookiesService(mockConfig({}));
    const res = { cookie: vi.fn() } as unknown as Response;
    sut.clearAccessTokenCookie(res);
    expect(res.cookie).toHaveBeenCalledWith(
      'gt_access',
      '',
      expect.objectContaining({ maxAge: 0, httpOnly: true }),
    );
  });

  it('clearAllAuthCookies clears both cookies', () => {
    const sut = new AuthCookiesService(mockConfig({}));
    const res = { cookie: vi.fn() } as unknown as Response;
    sut.clearAllAuthCookies(res);
    expect(res.cookie).toHaveBeenCalledTimes(2);
  });
});
