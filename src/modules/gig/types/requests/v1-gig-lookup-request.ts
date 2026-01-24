import { IsString, MaxLength, MinLength } from 'class-validator';
import type { GigDto } from '../gig.types';

export class V1GigLookupRequestBody {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  location!: string;
}

export interface V1GigLookupResponseBody {
  gig: GigDto;
}
