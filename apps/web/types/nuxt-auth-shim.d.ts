declare module '#auth' {
  import type { Ref } from 'vue';
  import type { Session } from 'next-auth';

  type AuthStatus = 'authenticated' | 'unauthenticated' | 'loading';

  export function useAuth(): {
    data: Ref<Session | null>;
    status: Ref<AuthStatus>;
    getSession: () => Promise<Session | null>;
    signIn: (provider?: string, options?: Record<string, any>) => Promise<unknown>;
    signOut: (options?: Record<string, any>) => Promise<void>;
  };

  export const NuxtAuthHandler: any;
}

