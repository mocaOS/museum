import "server-only";
import type { ResolvedKey } from "./backend-key";

/**
 * The museum Library is public: anyone can ask the Cortex without an account.
 * A single env key (CORTEX_API_KEY) is used server-side for anonymous chat and
 * search, scoped to all collections ([] = all). Logged-in community members
 * still get their group-scoped key (see getGroupChatKey); this is the fallback
 * for everyone else.
 */
export function getPublicChatKey(): ResolvedKey | null {
  const apiKey = process.env.CORTEX_API_KEY || process.env.BACKEND_ADMIN_API_KEY;
  if (!apiKey) return null;
  return { apiKey, collectionIds: [], permission: "read" };
}
