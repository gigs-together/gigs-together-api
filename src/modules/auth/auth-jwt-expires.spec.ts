import type { ConfigService } from '@nestjs/config';
import {
  getJwtAccessExpiresInSeconds,
  getJwtRefreshExpiresInSeconds,
} from './auth-jwt-expires';

function mockConfig(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('auth-jwt-expires', () => {
  describe('getJwtAccessExpiresInSeconds', () => {
    it('returns default 3_600 s (1 h) when unset', () => {
      expect(getJwtAccessExpiresInSeconds(mockConfig({}))).toBe(3_600);
    });

    it('parses a positive integer from env', () => {
      expect(
        getJwtAccessExpiresInSeconds(
          mockConfig({ JWT_ACCESS_EXPIRES_IN_SEC: '7200' }),
        ),
      ).toBe(7_200);
    });

    it('floors non-integer numeric strings', () => {
      expect(
        getJwtAccessExpiresInSeconds(
          mockConfig({ JWT_ACCESS_EXPIRES_IN_SEC: '90.7' }),
        ),
      ).toBe(90);
    });

    it('falls back when value is zero or invalid', () => {
      expect(
        getJwtAccessExpiresInSeconds(
          mockConfig({ JWT_ACCESS_EXPIRES_IN_SEC: '0' }),
        ),
      ).toBe(3_600);
      expect(
        getJwtAccessExpiresInSeconds(
          mockConfig({ JWT_ACCESS_EXPIRES_IN_SEC: 'nope' }),
        ),
      ).toBe(3_600);
    });
  });

  describe('getJwtRefreshExpiresInSeconds', () => {
    it('returns default 2_592_000 s (30 d) when unset', () => {
      expect(getJwtRefreshExpiresInSeconds(mockConfig({}))).toBe(2_592_000);
    });

    it('parses a positive integer from env', () => {
      expect(
        getJwtRefreshExpiresInSeconds(
          mockConfig({ JWT_REFRESH_EXPIRES_IN_SEC: '86400' }),
        ),
      ).toBe(86_400);
    });
  });
});
