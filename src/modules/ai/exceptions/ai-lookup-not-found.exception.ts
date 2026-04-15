import { NotFoundException } from '@nestjs/common';

export class AiLookupNotFoundException extends NotFoundException {
  constructor() {
    super('Future gig not found');
  }
}
