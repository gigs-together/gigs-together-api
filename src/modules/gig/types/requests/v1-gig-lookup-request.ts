import { IsString, MaxLength, MinLength } from 'class-validator';
import type { V1ReceiverCreateGigRequestBodyGig } from '../../../receiver/types/requests/v1-receiver-create-gig-request';

/** DTO for `class-validator` only. Do not use as `@Body()` param type — Nest may pass the constructor into pipes. */
export class V1GigLookupBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  location!: string; // free form - e.g. city + country
}

export interface V1GigLookupFields {
  readonly name: string;
  readonly location: string;
}

export interface V1GigLookupResponseBody {
  gig: V1ReceiverCreateGigRequestBodyGig;
}
