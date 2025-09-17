declare module '#auth' {
  import type { Ref } from 'vue';
  import type { Directus } from '@local/types';

  type AuthStatus = 'authenticated' | 'unauthenticated' | 'loading';

  export interface SessionData {
    user?: Directus.DirectusUsers | null;
    access_token?: string;
    error?: string;
  }

  export function useAuth(): {
    data: Ref<SessionData | null>;
    status: Ref<AuthStatus>;
    getSession: () => Promise<SessionData | null>;
    signIn: (provider?: string, options?: Record<string, any>) => Promise<unknown>;
    signOut: (options?: Record<string, any>) => Promise<void>;
  };

  export const NuxtAuthHandler: any;
}

