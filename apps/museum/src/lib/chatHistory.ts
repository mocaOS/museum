import { ChatMessage, ChatSession } from "@/types";

const BASE = "/api/me/chats";

async function http<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Chat API error: ${res.status}`);
  }
  return res.json();
}

export async function listChats(): Promise<ChatSession[]> {
  const data = await http<{ sessions: ChatSession[] }>(BASE);
  return data?.sessions ?? [];
}

export async function getChat(id: string): Promise<ChatSession | null> {
  return http<ChatSession>(`${BASE}/${id}`);
}

export async function createChat(
  id?: string,
  title?: string
): Promise<ChatSession> {
  const data = await http<ChatSession>(BASE, {
    method: "POST",
    body: JSON.stringify({ id, title }),
  });
  if (!data) throw new Error("Failed to create chat");
  return data;
}

export function updateChatMessages(
  id: string,
  messages: ChatMessage[],
  memory?: unknown
): Promise<void> {
  // Only include memory when we actually have one, so we never clobber a stored
  // blob with null on a turn that produced no memory_update.
  const body =
    memory !== undefined ? { messages, memory } : { messages };
  return http(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }).then(() => undefined);
}

export function updateChatTitle(id: string, title: string): Promise<void> {
  return http(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  }).then(() => undefined);
}

export function deleteChat(id: string): Promise<void> {
  return http(`${BASE}/${id}`, { method: "DELETE" }).then(() => undefined);
}
