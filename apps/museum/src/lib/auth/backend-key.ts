import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiKeys, groups, type User } from "@/lib/db/schema";
import { decryptSecret } from "./crypto";

export interface ResolvedKey {
  apiKey: string;
  collectionIds: string[]; // [] = all
  permission: "read" | "manage";
}

export function getGroupChatKey(user: User): ResolvedKey | null {
  if (!user.groupId) return null;
  const group = db.select().from(groups).where(eq(groups.id, user.groupId)).get();
  if (!group?.chatKeyId) return null;
  const key = db.select().from(apiKeys).where(eq(apiKeys.id, group.chatKeyId)).get();
  if (!key) return null;
  return {
    apiKey: decryptSecret(key.encryptedValue),
    collectionIds: JSON.parse(key.collectionIds || "[]"),
    permission: key.permission,
  };
}

export function getUserContentKey(user: User): ResolvedKey | null {
  // Admin and superadmin always upload via the env admin key, scoped to all
  // collections. This side-steps the per-user content-role flow for org-level
  // accounts that should have blanket access.
  if (user.role === "superadmin" || user.role === "admin") {
    const envKey = process.env.BACKEND_ADMIN_API_KEY;
    if (!envKey) return null;
    return { apiKey: envKey, collectionIds: [], permission: "manage" };
  }

  if (!user.contentKeyId) return null;
  const key = db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, user.contentKeyId))
    .get();
  if (!key) return null;
  return {
    apiKey: decryptSecret(key.encryptedValue),
    collectionIds: JSON.parse(key.collectionIds || "[]"),
    permission: key.permission,
  };
}
