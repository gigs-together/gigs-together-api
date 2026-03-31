import type { User } from '../modules/telegram/types/user.types';

declare module 'express-serve-static-core' {
  interface Request {
    authenticatedUser?: User;
  }
}
