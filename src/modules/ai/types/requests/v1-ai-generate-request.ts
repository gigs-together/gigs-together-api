import { IsString, MaxLength, MinLength } from 'class-validator';

export class V1AiGenerateRequestBody {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  place!: string;
}

export interface V1AiGenerateResponseBody {
  text: string;
}
