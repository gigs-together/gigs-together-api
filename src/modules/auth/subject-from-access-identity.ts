import { UnauthorizedException } from '@nestjs/common';
import type { AccessTokenIdentityPayload } from '../../shared/types/access-token-identity.types';

export function subjectFromAccessIdentity(
  identity: AccessTokenIdentityPayload,
): string {
  switch (identity.kind) {
    case 'telegram':
      return `telegram:${identity.telegramUserId}`;
    default:
      throw new UnauthorizedException('Unsupported access token identity');
  }
}
