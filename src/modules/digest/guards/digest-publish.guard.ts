import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const DIGEST_PUBLISH_SECRET_ENV_KEY = 'DIGEST_PUBLISH_SECRET';
const DIGEST_PUBLISH_SECRET_HEADER = 'x-digest-publish-secret';

function readSingleHeader(
  req: Request,
  headerName: string,
): string | undefined {
  const raw = req.headers[headerName];
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Requires `x-digest-publish-secret` to match configured DIGEST_PUBLISH_SECRET.
 * When the env secret is unset, rejects with 503 (endpoint not operational).
 */
@Injectable()
export class DigestPublishGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const secretHeader = readSingleHeader(req, DIGEST_PUBLISH_SECRET_HEADER);

    const secret = (
      this.configService.get<string>(DIGEST_PUBLISH_SECRET_ENV_KEY) ?? ''
    ).trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        `${DIGEST_PUBLISH_SECRET_ENV_KEY} is not configured`,
      );
    }
    const provided = (secretHeader ?? '').trim();
    if (!provided || provided !== secret) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
