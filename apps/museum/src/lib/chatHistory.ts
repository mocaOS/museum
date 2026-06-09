import { ChatMessage, ChatSession } from "@/types";

// Chat history is stored entirely client-side in localStorage. The Library is
// anonymous (no accounts, no server-side history), so a visitor's chats live on
// their own machine and persist across reloads, restarts, and days — until they
// clear browser storage. All functions stay async so callers are unchanged.

const STORAGE_KEY = "moca-library-chats";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readAll(): ChatSession[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatSession[]) : [];
  } catch {
    return [];
  }
}

function writeAll(sessions: ChatSession[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    /* quota exceeded or storage disabled — history is best-effort */
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Most-recently-updated first, matching the previous server ordering.
export async function listChats(): Promise<ChatSession[]> {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getChat(id: string): Promise<ChatSession | null> {
  return readAll().find((s) => s.id === id) ?? null;
}

export async function createChat(
  id?: string,
  title?: string
): Promise<ChatSession> {
  const now = Date.now();
  const session: ChatSession = {
    id: id ?? newId(),
    title: title ?? "",
    messages: [],
    memory: undefined,
    createdAt: now,
    updatedAt: now,
  };
  const sessions = readAll();
  sessions.push(session);
  writeAll(sessions);
  return session;
}

export async function updateChatMessages(
  id: string,
  messages: ChatMessage[],
  memory?: unknown
): Promise<void> {
  const sessions = readAll();
  const session = sessions.find((s) => s.id === id);
  if (!session) return;
  session.messages = messages;
  // Only overwrite memory when we actually have one, so we never clobber a
  // stored blob with undefined on a turn that produced no memory_update.
  if (memory !== undefined) session.memory = memory;
  session.updatedAt = Date.now();
  writeAll(sessions);
}

export async function updateChatTitle(id: string, title: string): Promise<void> {
  const sessions = readAll();
  const session = sessions.find((s) => s.id === id);
  if (!session) return;
  session.title = title;
  session.updatedAt = Date.now();
  writeAll(sessions);
}

export async function deleteChat(id: string): Promise<void> {
  writeAll(readAll().filter((s) => s.id !== id));
}
