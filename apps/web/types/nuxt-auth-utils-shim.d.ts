declare module '#auth-utils' {
  import type { H3Event } from 'h3';
  export function getUserSession(event: H3Event): Promise<any>;
  export function setUserSession(event: H3Event, session: any): Promise<void>;
  export function clearUserSession(event: H3Event): Promise<void>;
}


