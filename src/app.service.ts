import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { AppHealthResponse, AppRootResponse } from './app.types';

@Injectable()
export class AppService {
  constructor(
    @Optional()
    @InjectConnection()
    private readonly mongoConnection?: Connection,
  ) {}

  getRoot(): AppRootResponse {
    return { ok: true, service: 'gigs-together-api' };
  }

  async getHealth(): Promise<AppHealthResponse> {
    if (!this.mongoConnection || this.mongoConnection.readyState !== 1) {
      throw new ServiceUnavailableException('MongoDB is not connected');
    }

    if (!this.mongoConnection.db) {
      throw new ServiceUnavailableException(
        'MongoDB database handle is missing',
      );
    }

    await this.mongoConnection.db.admin().ping();

    return {
      ok: true,
      service: 'gigs-together-api',
      checks: {
        mongodb: {
          ok: true,
        },
      },
    };
  }
}
