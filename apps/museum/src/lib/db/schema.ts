import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// API keys issued by the library-backend, stored encrypted (AES-256-GCM).
// One row per backend key; referenced polymorphically by groups.chatKeyId (read)
// and users.contentKeyId (manage).
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  backendKeyId: text("backend_key_id").notNull(),
  encryptedValue: text("encrypted_value").notNull(), // base64: iv|ciphertext|tag
  permission: text("permission", { enum: ["read", "manage"] }).notNull(),
  // JSON-encoded array of collection ids; "[]" means all collections.
  collectionIds: text("collection_ids").notNull().default("[]"),
  label: text("label").notNull().default(""),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  chatKeyId: text("chat_key_id").references(() => apiKeys.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  username: text("username").notNull().default(""),
  avatarPath: text("avatar_path"),
  role: text("role", { enum: ["user", "admin", "superadmin"] })
    .notNull()
    .default("user"),
  groupId: text("group_id").references(() => groups.id, {
    onDelete: "set null",
  }),
  contentKeyId: text("content_key_id").references(() => apiKeys.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  lastLoginAt: integer("last_login_at"),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ip: text("ip").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  lastSeenAt: integer("last_seen_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  expiresAt: integer("expires_at").notNull(),
});

export const loginEvents = sqliteTable("login_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  emailAttempted: text("email_attempted").notNull(),
  success: integer("success").notNull(),
  ip: text("ip").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const chatSessions = sqliteTable("chat_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  // Opaque conversation_memory blob (JSON string) replayed to the backend on
  // each turn. Nullable — null/absent means "no memory yet" (turn 1 behavior).
  memory: text("memory"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  chatSessionId: text("chat_session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  // JSON-encoded: { sources, graphContext, thinking, subQuestions, retrieval, retrievalStats }
  metadata: text("metadata").notNull().default("{}"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["message", "upload", "login"] }).notNull(),
  collectionId: text("collection_id"),
  // JSON-encoded payload (e.g. filename, token counts, mode).
  metadata: text("metadata").notNull().default("{}"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// Superadmin-editable runtime settings (title, description, etc.). Key-value
// to keep future additions schema-free. Defaults live in src/lib/settings.ts.
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type LoginEvent = typeof loginEvents.$inferSelect;
export type ChatSessionRow = typeof chatSessions.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type UsageEvent = typeof usageEvents.$inferSelect;
