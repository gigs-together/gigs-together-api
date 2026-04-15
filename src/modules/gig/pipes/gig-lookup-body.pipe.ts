import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import {
  BadRequestException,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { isRecord } from '../../../shared/utils/is-record';
import type { V1GigLookupFields } from '../types/requests/v1-gig-lookup-request';
import { V1GigLookupBodyDto } from '../types/requests/v1-gig-lookup-request';

const lookupFieldsMetadata: ArgumentMetadata = {
  type: 'body',
  metatype: V1GigLookupBodyDto,
  data: undefined,
};

/**
 * Validates `name` and `location` via Nest {@link ValidationPipe}.
 */
@Injectable()
export class GigLookupBodyPipe implements PipeTransform<
  unknown,
  Promise<V1GigLookupFields>
> {
  private readonly validationPipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidUnknownValues: false,
  });

  async transform(bodyRaw: unknown): Promise<V1GigLookupFields> {
    if (!isRecord(bodyRaw)) {
      throw new BadRequestException('Body must be an object');
    }
    const partial = await this.validationPipe.transform(
      { name: bodyRaw.name, location: bodyRaw.location },
      lookupFieldsMetadata,
    );

    if (!isRecord(partial)) {
      throw new BadRequestException('Invalid lookup fields shape');
    }
    const name = partial.name;
    const location = partial.location;
    if (typeof name !== 'string' || typeof location !== 'string') {
      throw new BadRequestException('Invalid lookup fields shape');
    }

    return { name, location };
  }
}
