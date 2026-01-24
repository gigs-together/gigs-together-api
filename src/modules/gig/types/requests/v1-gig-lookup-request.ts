import { IsString, MaxLength, MinLength } from 'class-validator';
import { V1ReceiverCreateGigRequestBodyGig } from '../../../receiver/types/requests/v1-receiver-create-gig-request';

export class V1GigLookupRequestBody {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  location!: string; // free form - presumably a city
}

export interface V1GigLookupResponseBody {
  gig: V1ReceiverCreateGigRequestBodyGig;
}
