import { IsString, MinLength } from 'class-validator';

export class V1GigGetForEditBody {
  @IsString()
  @MinLength(1)
  publicId!: string;
}
