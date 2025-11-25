export interface TGUser {
  id: number;
  first_name: string;
  is_bot?: boolean;
  username?: string;
  language_code?: string;

  [key: string]: unknown;
}

export interface User {
  tgUser: TGUser;
  isAdmin: boolean;
}
