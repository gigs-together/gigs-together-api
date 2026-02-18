import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getRoot(): { ok: true; service: string } {
    return { ok: true, service: 'gigs-together-api' };
  }

  getHealth(): { ok: true } {
    return { ok: true };
  }
}
