import type { User } from '../../../telegram/types/user.types';

export interface V1ReceiverGigByPublicId {
  publicId: string;
}

export interface V1ReceiverGetGigForEditRequestBodyValidated
  extends V1ReceiverGigByPublicId {
  user: User;
}

export interface V1ReceiverUpdateGigByPublicIdResponseBody
  extends V1ReceiverGigByPublicId {}
