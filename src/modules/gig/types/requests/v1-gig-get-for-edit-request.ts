import type { User } from '../../../telegram/types/user.types';

export interface V1GigGetForEditRequestBodyValidated {
  publicId: string;
  user: User;
}
