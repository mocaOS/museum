import type { Directus } from '@local/types';

// Export a utility type for the enhanced session user
export type SessionUser = Directus.DirectusUsers & {
  name?: string | null;
  image?: string | null;
};

declare module '#auth-utils' {
  /**
   * User information - Full Directus user object with additional auth properties
   */
  interface User extends SessionUser {}

  /**
   * User session data stored in the secure cookie
   */
  interface UserSession {
    /**
     * Access token for making authenticated API requests to Directus
     */
    access_token?: string;
    
    /**
     * Refresh token for Directus
     */
    refresh_token?: string;
    
    /**
     * When the access token expires (timestamp in ms)
     */
    accessTokenExpires?: number;
    
    /**
     * Error flag if there was a problem with authentication
     */
    error?: string;
  }

  /**
   * Secure session data only accessible server-side
   */
  interface SecureSessionData {
    // Add any sensitive data here if needed
  }
}

export {} 