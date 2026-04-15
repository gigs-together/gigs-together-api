import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { User } from '../../../shared/types/user.types';
import { RequireAuthenticatedUserGuard } from './require-authenticated-user.guard';

function ctxWithUser(user: User | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as ExecutionContext;
}

describe('RequireAuthenticatedUserGuard', () => {
  it('throws UnauthorizedException when req.user is missing', () => {
    const guard = new RequireAuthenticatedUserGuard();
    expect(() => guard.canActivate(ctxWithUser(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('returns true when req.user is set', () => {
    const guard = new RequireAuthenticatedUserGuard();
    const user: User = {
      tgUser: { id: 1, first_name: 'X' },
      isAdmin: false,
    };
    expect(guard.canActivate(ctxWithUser(user))).toBe(true);
  });
});
