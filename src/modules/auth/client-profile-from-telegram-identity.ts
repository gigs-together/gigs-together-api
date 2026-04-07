import type { AccessTokenIdentityPayload } from './types/access-token-identity.types';
import type { V1TelegramClientProfile } from '../telegram/types/requests/v1-telegram-exchange-response';
import { isRecord } from '../../shared/utils/is-record';

/**
 * Builds {@link V1TelegramClientProfile} from a verified Telegram access/refresh identity.
 */
export function clientProfileFromTelegramIdentity(
  identity: AccessTokenIdentityPayload,
): V1TelegramClientProfile {
  if (identity.kind !== 'telegram') {
    throw new Error('Unsupported identity for client profile');
  }
  const snap = identity.snapshot;
  const username = snap.username;
  const displayLabel =
    typeof username === 'string' && username.trim()
      ? `@${username.trim()}`
      : snap.firstName;

  const extra = snap.extra;
  let photoUrl: string | undefined;
  if (isRecord(extra) && 'photo_url' in extra) {
    const raw = extra.photo_url;
    if (typeof raw === 'string' && raw.trim()) {
      const url = raw.trim();
      if (/^https:\/\//i.test(url)) {
        photoUrl = url;
      }
    }
  }

  return {
    displayLabel,
    ...(photoUrl ? { photoUrl } : {}),
  };
}
