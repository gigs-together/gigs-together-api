import type { User } from '../shared/types/user.types';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}
