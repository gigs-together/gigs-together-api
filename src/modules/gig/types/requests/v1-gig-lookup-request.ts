import { IsString, MaxLength, MinLength } from 'class-validator';
import type { User } from '../../../telegram/types/user.types';
import type { V1ReceiverCreateGigRequestBodyGig } from '../../../receiver/types/requests/v1-receiver-create-gig-request';

export class V1GigLookupFields {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  location!: string; // free form - e.g. city + country
}

/**
 * Request body after {@link TelegramInitDataUserPipe} (init data stripped, `user` attached).
 */
export interface GigLookupBodyAfterTelegramAuth {
  readonly user: User;
  name?: unknown;
  location?: unknown;
  [key: string]: unknown;
}

export interface V1GigLookupRequestBodyValidated extends V1GigLookupFields {
  readonly user: User;
}

export interface V1GigLookupResponseBody {
  gig: V1ReceiverCreateGigRequestBodyGig;
}
