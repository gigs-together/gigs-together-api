import { UnauthorizedException } from '@nestjs/common';
import type {
  TelegramAccessTokenIdentity,
  TelegramIdentitySnapshot,
  VerifiedAccessToken,
} from '../../auth/types/access-token-identity.types';
import type { TGUser, User } from '../types/user.types';

/**
 * Maps a Telegram {@link TGUser} into a neutral access-token identity for JWT signing.
 */
export function tgUserToTelegramAccessIdentity(
  tg: TGUser,
): TelegramAccessTokenIdentity {
  const { id, first_name, username, language_code, is_bot, ...rest } = tg;
  const extraKeys = Object.keys(rest);
  const snapshot: TelegramIdentitySnapshot = {
    firstName: first_name,
    username,
    languageCode: language_code,
    isBot: is_bot,
    ...(extraKeys.length > 0 ? { extra: rest } : {}),
  };
  return {
    kind: 'telegram',
    telegramUserId: id,
    snapshot,
  };
}

function telegramAccessIdentityToTgUser(
  identity: TelegramAccessTokenIdentity,
): TGUser {
  return {
    id: identity.telegramUserId,
    first_name: identity.snapshot.firstName,
    username: identity.snapshot.username,
    language_code: identity.snapshot.languageCode,
    is_bot: identity.snapshot.isBot,
    ...(identity.snapshot.extra ?? {}),
  };
}

/**
 * Maps a verified access token to the API {@link User} shape used by pipes and handlers.
 */
export function verifiedAccessTokenToUser(verified: VerifiedAccessToken): User {
  if (verified.identity.kind === 'telegram') {
    return {
      tgUser: telegramAccessIdentityToTgUser(verified.identity),
      isAdmin: verified.isAdmin,
    };
  }
  throw new UnauthorizedException('Unsupported access token identity');
}
