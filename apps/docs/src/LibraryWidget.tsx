import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The Library chat widget — a small window in the bottom-right of the docs.
 *
 * Privacy model (the whole point):
 * - Your questions and the answers live ONLY in your browser's localStorage.
 *   No account, no server-side history, nothing to subpoena.
 * - The presence list shows handles of visitors who asked the Library
 *   something *while you've been here*. It's an ephemeral broadcast — the
 *   server relays and forgets. What you (or your agent) don't experience
 *   live was never stored for you.
 * - Only your chosen handle is ever broadcast — never the question.
 *
 * Endpoints: chat streams through the museum's anonymous Library proxy;
 * presence uses the public /v1/presence routes on the MOCA API.
 */

const LS_HISTORY = "moca-docs-chat-history";
const LS_HANDLE = "moca-docs-chat-handle";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface Sighting {
  handle: string;
  at: number;
}

function endpoints() {
  const local =
    typeof window !== "undefined" && window.location.hostname === "localhost";
  return {
    ask: local
      ? "http://localhost:3331/api/ask/stream"
      : "https://museumofcryptoart.com/api/ask/stream",
    presence: local
      ? "http://localhost:8055/v1/presence"
      : "https://api.moca.qwellco.de/v1/presence",
  };
}

const S: Record<string, React.CSSProperties> = {
  fab: {
    position: "fixed",
    bottom: 20,
    right: 20,
    zIndex: 60,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderRadius: 999,
    border: "1px solid rgba(128,128,128,0.35)",
    background: "var(--background, #111)",
    color: "var(--foreground, #eee)",
    cursor: "pointer",
    boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
    fontSize: 13,
    fontWeight: 600,
  },
  panel: {
    position: "fixed",
    bottom: 20,
    right: 20,
    zIndex: 60,
    width: 360,
    maxWidth: "calc(100vw - 32px)",
    height: 520,
    maxHeight: "calc(100vh - 96px)",
    display: "flex",
    flexDirection: "column",
    borderRadius: 14,
    border: "1px solid rgba(128,128,128,0.35)",
    background: "var(--background, #111)",
    color: "var(--foreground, #eee)",
    boxShadow: "0 16px 60px rgba(0,0,0,0.45)",
    overflow: "hidden",
    fontSize: 13,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: "1px solid rgba(128,128,128,0.25)",
  },
  messages: { flex: 1, minHeight: 0, overflowY: "auto", padding: 12 },
  presence: {
    borderTop: "1px solid rgba(128,128,128,0.25)",
    padding: "8px 14px",
    maxHeight: 96,
    overflowY: "auto",
    fontSize: 11.5,
    opacity: 0.85,
  },
  inputRow: {
    display: "flex",
    gap: 8,
    padding: 10,
    borderTop: "1px solid rgba(128,128,128,0.25)",
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(128,128,128,0.35)",
    background: "transparent",
    color: "inherit",
    fontSize: 13,
    outline: "none",
  },
};

export default function LibraryWidget() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [handle, setHandle] = useState("");
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [here, setHere] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    try {
      setMessages(JSON.parse(localStorage.getItem(LS_HISTORY) || "[]"));
      setHandle(localStorage.getItem(LS_HANDLE) || "");
    } catch {
      /* fresh start */
    }
  }, []);

  // Persist history locally — this is the ONLY place conversations exist.
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(LS_HISTORY, JSON.stringify(messages.slice(-60)));
    } catch {
      /* quota */
    }
  }, [messages, mounted]);

  // Ephemeral presence feed: only events broadcast while we're connected.
  useEffect(() => {
    if (!mounted || !open) return;
    const es = new EventSource(`${endpoints().presence}/stream`);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "hello" || ev.type === "arrived" || ev.type === "left") {
          if (typeof ev.here === "number") setHere(ev.here);
        }
        if (ev.type === "library-search") {
          setSightings((prev) => [{ handle: ev.handle, at: ev.at }, ...prev].slice(0, 40));
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    es.onerror = () => {
      setHere(null);
    };
    return () => es.close();
  }, [mounted, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  const ask = useCallback(async () => {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "" }]);

    // Announce the *fact* of a search (handle only — never the question).
    fetch(`${endpoints().presence}/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: handle || "anon" }),
    }).catch(() => {});

    try {
      const history = messages.slice(-10);
      const res = await fetch(endpoints().ask, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          top_k: 5,
          conversation_history: history,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Library answered ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.content) {
              answer += ev.content;
              setMessages((m) => {
                const next = m.slice();
                next[next.length - 1] = { role: "assistant", content: answer };
                return next;
              });
            }
            if (ev.error) throw new Error(ev.error);
          } catch (err) {
            if (err instanceof SyntaxError) continue;
            throw err;
          }
        }
      }
      if (!answer) {
        setMessages((m) => {
          const next = m.slice();
          next[next.length - 1] = {
            role: "assistant",
            content: "The Library had nothing to say — try rephrasing?",
          };
          return next;
        });
      }
    } catch (err) {
      setMessages((m) => {
        const next = m.slice();
        next[next.length - 1] = {
          role: "assistant",
          content: `Couldn't reach the Library (${err instanceof Error ? err.message : "unknown error"}).`,
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, handle]);

  if (!mounted) return null;

  // Portal to <body>: the widget mounts from a header slot whose ancestors
  // use backdrop-filter/transform, which would hijack position:fixed.
  if (!open) {
    return createPortal(
      <button style={S.fab} onClick={() => setOpen(true)} aria-label="Ask the Library">
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: "#e0b24d",
            display: "inline-block",
          }}
        />
        Ask the Library
      </button>,
      document.body
    );
  }

  return createPortal(
    <div style={S.panel}>
      <div style={S.header}>
        <div>
          <div style={{ fontWeight: 700 }}>The Library</div>
          <div style={{ fontSize: 10.5, opacity: 0.7 }}>
            {here != null ? `${here} in the museum now · ` : ""}history stays on your device
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value);
              try {
                localStorage.setItem(LS_HANDLE, e.target.value);
              } catch {
                /* noop */
              }
            }}
            placeholder="handle / 0x…"
            style={{ ...S.input, flex: "none", width: 110, fontSize: 11, padding: "4px 8px" }}
            title="Shown to others when you search. Optional."
          />
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div ref={scrollRef} style={S.messages}>
        {messages.length === 0 && (
          <div style={{ opacity: 0.7, lineHeight: 1.5 }}>
            Ask anything about MOCA's tech — the API, exhibitions, DeCC0s, souls,
            integrations. Answers come from the museum's knowledge base with
            citations. Your conversation never leaves this browser.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              margin: "6px 0",
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                whiteSpace: "pre-wrap",
                lineHeight: 1.45,
                padding: "8px 11px",
                borderRadius: 10,
                background:
                  m.role === "user" ? "rgba(224,178,77,0.18)" : "rgba(128,128,128,0.14)",
              }}
            >
              {m.content || (busy && i === messages.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
      </div>

      <div style={S.presence}>
        <div style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9.5, opacity: 0.7, marginBottom: 4 }}>
          Searched since you arrived
        </div>
        {sightings.length === 0 ? (
          <div style={{ opacity: 0.55 }}>No one yet — only what happens while you're here.</div>
        ) : (
          sightings.map((s, i) => (
            <div key={`${s.at}-${i}`} style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
              <span style={{ fontFamily: "monospace" }}>{s.handle}</span>
              <span style={{ opacity: 0.55 }}>
                {new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))
        )}
      </div>

      <div style={S.inputRow}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder={busy ? "Thinking…" : "Ask the Library…"}
          disabled={busy}
          style={S.input}
        />
        <button
          onClick={ask}
          disabled={busy || !input.trim()}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "#e0b24d",
            color: "#1a1407",
            fontWeight: 700,
            cursor: busy ? "wait" : "pointer",
            opacity: busy || !input.trim() ? 0.5 : 1,
          }}
        >
          Ask
        </button>
      </div>
    </div>,
    document.body
  );
}
