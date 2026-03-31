import type { User } from '../user.types';

/**
 * Request body after {@link TelegramInitDataUserPipe} for `POST /v1/auth/telegram`.
 */
export interface V1TelegramExchangeRequestBodyValidated {
  readonly user: User;
}
