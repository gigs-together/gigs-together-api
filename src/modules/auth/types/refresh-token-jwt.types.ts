import type { AccessTokenIdentityPayload } from './access-token-identity.types';

export interface RefreshTokenJwtPayload {
  readonly sub: string;
  readonly typ: 'refresh';
  readonly identity: AccessTokenIdentityPayload;
}
