import "server-only";
import type { User } from "@/lib/db/schema";

type HistoryEntry = { role: string; content: string };

/**
 * Replace template variables in the admin-defined cortex analytics template
 * with values from the authenticated user. Returns `null` when the template
 * is empty so the caller can skip injection cleanly.
 *
 * Variables: see CORTEX_ANALYTICS_VARIABLES in src/lib/settings.ts.
 */
export function renderCortexAnalytics(
  template: string,
  user: Pick<User, "email" | "username">
): string | null {
  const trimmed = template.trim();
  if (!trimmed) return null;
  const username = user.username && user.username.length > 0 ? user.username : user.email;
  return trimmed
    .replaceAll("$userEmail", user.email)
    .replaceAll("$userName", username);
}

/**
 * Prepend the rendered analytics block as the first entry of
 * `conversation_history` in the backend request body. If the body isn't
 * valid JSON, returns it unchanged (we fail open — never break the chat
 * because of a malformed admin template).
 */
export function injectCortexAnalytics(
  bodyText: string,
  rendered: string | null
): string {
  if (!rendered) return bodyText;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
  if (!parsed || typeof parsed !== "object") return bodyText;

  const raw = parsed.conversation_history;
  const history: HistoryEntry[] = Array.isArray(raw) ? (raw as HistoryEntry[]) : [];
  parsed.conversation_history = [
    { role: "user", content: rendered },
    ...history,
  ];
  return JSON.stringify(parsed);
}
