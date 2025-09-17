import 'next-auth';
import type { Directus } from '@local/types';

// Export a utility type for the enhanced session user
export type SessionUser = Directus.DirectusUsers & {
  name?: string | null;
  image?: string | null;
};

declare module 'next-auth' {
  /**
   * Extends the built-in session types
   */
  interface Session {
    /**
     * Access token for making authenticated API requests to Directus
     */
    access_token?: string;
    
    /**
     * Error flag if there was a problem with authentication
     */
    error?: string;
    accessTokenExpires?: number;
    
    /**
     * User information - Full Directus user object with additional auth properties
     */
    user?: SessionUser;
  }
  
  /**
   * The shape of the user object returned in the OAuth providers' `profile` callback,
   * or the second parameter of the `session` callback, when using a database.
   */
  interface User extends SessionUser {}
}

declare module 'next-auth/jwt' {
  /**
   * Extends the built-in JWT types
   */
  interface JWT {
    /**
     * Access token for Directus
     */
    access_token?: string;
    
    /**
     * Refresh token for Directus
     */
    refresh_token?: string;
    
    /**
     * When the access token expires
     */
    accessTokenExpires?: number;
    
    /**
     * Error flag if there was a problem with token refresh
     */
    error?: string;
  }
} 