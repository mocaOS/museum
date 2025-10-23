import type { DefaultSession, DefaultUser } from 'next-auth';
import type { Directus } from '@local/types';

type DirectusUsers = Directus.DirectusUsers;

declare module 'next-auth' {
  interface User extends DefaultUser, Partial<DirectusUsers> {}

  interface Session extends DefaultSession {
    user?: (DefaultSession['user'] & Partial<DirectusUsers>) | null;
    access_token?: string;
  }
}


