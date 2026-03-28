import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import {
  BadRequestException,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { isRecord } from '../../../shared/utils/is-record';
import { V1GigLookupFields } from '../types/requests/v1-gig-lookup-request';
import type {
  GigLookupBodyAfterTelegramAuth,
  V1GigLookupRequestBodyValidated,
} from '../types/requests/v1-gig-lookup-request';

const lookupFieldsMetadata: ArgumentMetadata = {
  type: 'body',
  metatype: V1GigLookupFields,
  data: undefined,
};

/**
 * Validates `name` and `location` via Nest {@link ValidationPipe} (same engine as the global pipe)
 * after {@link TelegramInitDataUserPipe}, then merges `user` back in.
 */
@Injectable()
export class GigLookupBodyPipe implements PipeTransform<
  GigLookupBodyAfterTelegramAuth,
  Promise<V1GigLookupRequestBodyValidated>
> {
  private readonly validationPipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidUnknownValues: false,
  });

  async transform(
    body: GigLookupBodyAfterTelegramAuth,
  ): Promise<V1GigLookupRequestBodyValidated> {
    const partial = await this.validationPipe.transform(
      { name: body.name, location: body.location },
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

    return {
      user: body.user,
      name,
      location,
    };
  }
}
