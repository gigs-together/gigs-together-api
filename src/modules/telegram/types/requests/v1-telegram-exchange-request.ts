import type { User } from '../user.types';

/**
 * Request body after {@link TelegramInitDataUserPipe} for `POST /v1/auth/telegram`.
 * Identity is resolved by AccessJwtAuthGuard and/or TelegramInitDataAuthGuard before the pipe runs.
 */
export interface V1TelegramExchangeRequestBodyValidated {
  readonly user: User;
}
