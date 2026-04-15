import { UnauthorizedException } from '@nestjs/common';
import type { AccessTokenIdentityPayload } from '../../shared/types/access-token-identity.types';
import { subjectFromAccessIdentity } from './subject-from-access-identity';

describe('subjectFromAccessIdentity', () => {
  it('builds stable sub for telegram identity', () => {
    const id: AccessTokenIdentityPayload = {
      kind: 'telegram',
      telegramUserId: 7,
      snapshot: { firstName: 'A' },
    };
    expect(subjectFromAccessIdentity(id)).toBe('telegram:7');
  });

  it('throws for unsupported identity kinds', () => {
    const invalidIdentity = {
      kind: 'oauth',
    } as unknown as AccessTokenIdentityPayload;
    expect(() => subjectFromAccessIdentity(invalidIdentity)).toThrow(
      UnauthorizedException,
    );
  });
});
