import type { ExecutionContext } from '@nestjs/common';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { DigestPublishGuard } from './digest-publish.guard';

function mockExecutionContext(headers: Request['headers']): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: (): Pick<Request, 'headers'> => ({ headers }),
    }),
  } as ExecutionContext;
}

function mockConfigService(secretFromEnv: string | undefined): ConfigService {
  const get = vi.fn((key: string): string | undefined =>
    key === 'DIGEST_PUBLISH_SECRET' ? secretFromEnv : undefined,
  );
  return { get } as unknown as ConfigService;
}

describe('DigestPublishGuard', () => {
  it('should throw ServiceUnavailableException when DIGEST_PUBLISH_SECRET is not configured', () => {
    const guard = new DigestPublishGuard(mockConfigService(undefined));

    try {
      guard.canActivate(
        mockExecutionContext({ 'x-digest-publish-secret': 'any' }),
      );
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      if (!(error instanceof ServiceUnavailableException)) {
        throw error;
      }
      expect(String(error.message)).toContain('DIGEST_PUBLISH_SECRET');
      return;
    }

    throw new Error('expected ServiceUnavailableException');
  });

  it('should throw ServiceUnavailableException when DIGEST_PUBLISH_SECRET is whitespace only', () => {
    const guard = new DigestPublishGuard(mockConfigService('   \t '));

    expect(() =>
      guard.canActivate(
        mockExecutionContext({ 'x-digest-publish-secret': 'token' }),
      ),
    ).toThrow(ServiceUnavailableException);
  });

  it('should throw UnauthorizedException when digest publish secret header is missing', () => {
    const guard = new DigestPublishGuard(mockConfigService('secret-token'));

    expect(() => guard.canActivate(mockExecutionContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when digest publish secret header does not match', () => {
    const guard = new DigestPublishGuard(mockConfigService('secret-token'));

    expect(() =>
      guard.canActivate(
        mockExecutionContext({ 'x-digest-publish-secret': 'wrong' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('should return true when trimmed digest publish secret header matches configured secret', () => {
    const guard = new DigestPublishGuard(mockConfigService('secret-token'));

    expect(
      guard.canActivate(
        mockExecutionContext({
          'x-digest-publish-secret': '  secret-token  ',
        }),
      ),
    ).toBe(true);
  });

  it('should accept first header value when digest publish secret is sent as duplicate headers', () => {
    const guard = new DigestPublishGuard(mockConfigService('secret-token'));

    expect(
      guard.canActivate(
        mockExecutionContext({
          'x-digest-publish-secret': ['secret-token', 'ignored'],
        }),
      ),
    ).toBe(true);
  });
});
