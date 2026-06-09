import "server-only";

type HistoryEntry = { role: string; content: string };

/**
 * Prepend a static analytics/context block as the first entry of
 * `conversation_history` in the backend request body, for Cortex agent skills
 * to read. The block is sourced from the CORTEX_ANALYTICS_TEMPLATE env var
 * (see getAppSettings().cortexAnalyticsTemplate). Pass an empty/whitespace
 * template to skip injection.
 *
 * If the body isn't valid JSON, returns it unchanged (we fail open — never
 * break the chat because of a malformed template).
 */
export function injectCortexAnalytics(
  bodyText: string,
  template: string | null | undefined
): string {
  const trimmed = template?.trim();
  if (!trimmed) return bodyText;

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
    { role: "user", content: trimmed },
    ...history,
  ];
  return JSON.stringify(parsed);
}
