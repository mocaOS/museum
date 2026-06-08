"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChatMessage, ChatSession, Mode, Settings, Source, GraphContext, RetrievalStats } from "@/types";
import { CurrentUser } from "@/types/auth";
import {
  askQuestion,
  askQuestionStream,
  fetchCollections,
} from "@/lib/api";
import {
  listChats,
  getChat,
  createChat,
  updateChatMessages,
  updateChatTitle,
  deleteChat,
} from "@/lib/chatHistory";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

import { getConfig, getCachedConfig } from "@/lib/config";
import { Collection } from "@/types";
import Header from "@/components/Header";
import MessageList from "@/components/MessageList";
import ChatInput from "@/components/ChatInput";
import SourceModal from "@/components/SourceModal";
import SettingsPanel from "@/components/SettingsPanel";
import Sidebar from "@/components/Sidebar";

export default function LibraryPage() {
  useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("chat");
  const [settings, setSettings] = useState<Settings>({
    streaming: true,
    collectionId: null,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [logoUrl, setLogoUrl] = useState(
    () => getCachedConfig()?.logoUrl || "/logo.svg"
  );
  const [configReady, setConfigReady] = useState(() => !!getCachedConfig());
  // Anonymous (public) users are allowed; currentUser stays null for them.
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const titleGeneratedRef = useRef<Set<string>>(new Set());
  // Opaque conversation_memory blob for the active session. Held in a ref so
  // the async handleSend always reads the latest value (no stale closure) and
  // so updating it mid-stream doesn't trigger a re-render. Replayed verbatim on
  // each turn, replaced from the memory_update event. Works in-session for
  // anonymous visitors too; persisted with messages only for signed-in members.
  const memoryRef = useRef<unknown>(undefined);

  // Library-specific empty state (members of the community studying the archive).
  const emptyTitle = "The MOCA Library";
  const emptyDescription =
    "Study and curate the past while querying the present. Learn about crypto art, the collection, and Web3 culture. Powered by Cortex.";

  const refreshSessions = useCallback(async () => {
    try {
      const list = await listChats();
      setSessions(list);
    } catch {
      /* anonymous or 401 — no server-side history */
    }
  }, []);

  // Load config, optional auth, collections on mount.
  useEffect(() => {
    getConfig().then((cfg) => {
      setLogoUrl(cfg.logoUrl || "/logo.svg");
      setConfigReady(true);
    });
    // Auth is optional for the public Library. A 401 just means "anonymous".
    fetch("/api/auth/me")
      .then(async (res) => (res.ok ? ((await res.json()) as CurrentUser) : null))
      .then((me) => {
        if (me) {
          setCurrentUser(me);
          refreshSessions();
        }
      })
      .catch(() => {});
    fetchCollections()
      .then(setCollections)
      .catch(() => {});
  }, [refreshSessions]);

  const handleSignOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setCurrentUser(null);
    setSessions([]);
    setActiveSessionId(null);
  }, []);

  // Persist messages whenever they settle — members only (anonymous = ephemeral).
  useEffect(() => {
    if (!currentUser || !activeSessionId || messages.length === 0) return;
    const hasStreaming = messages.some((m) => m.isStreaming);
    if (hasStreaming) return;
    updateChatMessages(activeSessionId, messages, memoryRef.current)
      .then(refreshSessions)
      .catch(() => {});
  }, [messages, activeSessionId, currentUser, refreshSessions]);

  const handleSelectSession = useCallback(async (id: string) => {
    const session = await getChat(id);
    if (session) {
      setActiveSessionId(id);
      setMessages(session.messages ?? []);
      memoryRef.current = session.memory;
      setIsLoading(false);
    }
  }, []);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await deleteChat(id);
      await refreshSessions();
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
        memoryRef.current = undefined;
      }
    },
    [activeSessionId, refreshSessions]
  );

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
    memoryRef.current = undefined;
    setIsLoading(false);
  }, []);

  const handleSend = useCallback(
    async (question: string) => {
      if (!question.trim() || isLoading) return;

      // Server-side chat sessions only exist for signed-in members.
      let sessionId = activeSessionId;
      if (currentUser && !sessionId) {
        const created = await createChat();
        sessionId = created.id;
        setActiveSessionId(sessionId);
        refreshSessions();
      }

      const isFirstMessage = messages.length === 0;

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: question,
      };

      const assistantId = uid();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        sources: [],
        thinking: [],
        subQuestions: [],
        isStreaming: true,
      };

      if (
        currentUser &&
        isFirstMessage &&
        sessionId &&
        !titleGeneratedRef.current.has(sessionId)
      ) {
        titleGeneratedRef.current.add(sessionId);
        updateChatTitle(sessionId, question).then(refreshSessions).catch(() => {});
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      const conversationHistory = messages
        .filter((m) => !m.isStreaming)
        .map((m) => ({ role: m.role, content: m.content }));

      const request = {
        question,
        use_agentic: mode === "deep-research",
        use_graph: true,
        use_reranking: true,
        conversation_history: conversationHistory,
        collection_id: settings.collectionId ?? null,
        // Replay the opaque memory blob (or {} on turn 1). The backend returns
        // an updated one via memory_update; we never construct or mutate it.
        conversation_memory: memoryRef.current ?? {},
      };

      const finalize = (finalMessages: ChatMessage[]) => {
        if (currentUser && sessionId) {
          updateChatMessages(sessionId, finalMessages, memoryRef.current)
            .then(refreshSessions)
            .catch(() => {});
        }
      };

      if (settings.streaming) {
        const controller = new AbortController();
        abortRef.current = controller;

        await askQuestionStream(
          request,
          {
            onContent: (token) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + token }
                    : m
                )
              );
            },
            onSources: (sources: Source[]) => {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, sources } : m))
              );
            },
            onGraphContext: (graphContext: GraphContext) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, graphContext } : m
                )
              );
            },
            onThinking: (step: string) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, thinking: [...(m.thinking || []), step] }
                    : m
                )
              );
            },
            onSubQuestions: (questions: string[]) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, subQuestions: questions } : m
                )
              );
            },
            onRetrieval: (info: string) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, retrieval: [...(m.retrieval || []), info] }
                    : m
                )
              );
            },
            onRetrievalStats: (stats: RetrievalStats) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, retrievalStats: stats } : m
                )
              );
            },
            onStatus: (status) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, status } : m
                )
              );
            },
            onMemoryUpdate: (memory) => {
              // Store verbatim; persisted with the message on settle (members)
              // and replayed as conversation_memory next turn (everyone).
              memoryRef.current = memory;
            },
            onDone: () => {
              setMessages((prev) => {
                const updated = prev.map((m) =>
                  m.id === assistantId ? { ...m, isStreaming: false } : m
                );
                finalize(updated);
                return updated;
              });
              setIsLoading(false);
            },
            onError: (error: string) => {
              setMessages((prev) => {
                const updated = prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: `${t("errorPrefix")}: ${error}`,
                        isStreaming: false,
                      }
                    : m
                );
                finalize(updated);
                return updated;
              });
              setIsLoading(false);
            },
          },
          controller.signal
        ).catch(() => {
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: m.content || t("requestCancelled"),
                    isStreaming: false,
                  }
                : m
            );
            finalize(updated);
            return updated;
          });
          setIsLoading(false);
        });
      } else {
        try {
          const data = await askQuestion(request);
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: data.answer,
                    sources: data.sources,
                    graphContext: data.graph_context,
                    isStreaming: false,
                  }
                : m
            );
            finalize(updated);
            return updated;
          });
        } catch (err) {
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `${t("errorPrefix")}: ${err instanceof Error ? err.message : t("unknownError")}`,
                    isStreaming: false,
                  }
                : m
            );
            finalize(updated);
            return updated;
          });
        }
        setIsLoading(false);
      }
    },
    [isLoading, messages, mode, settings, activeSessionId, currentUser, refreshSessions]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  if (!configReady) {
    return <div className="h-dvh bg-[var(--bg-primary)]" />;
  }

  return (
    <div className="flex flex-col h-dvh max-h-dvh overflow-hidden">
      <Header logoUrl={logoUrl} onToggleSidebar={() => setSidebarOpen(true)} />

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={() => {
          handleNewChat();
          setSidebarOpen(false);
        }}
        onDeleteSession={handleDeleteSession}
        logoUrl={logoUrl}
        currentUser={currentUser}
        onSignOut={handleSignOut}
      />

      <main className="flex-1 overflow-hidden relative">
        <MessageList
          messages={messages}
          onSourceClick={setSelectedSource}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
        />
      </main>

      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        isLoading={isLoading}
        mode={mode}
        onModeChange={setMode}
        onSettingsClick={() => setShowSettings(!showSettings)}
        collectionName={
          settings.collectionId
            ? collections.find((c) => c.id === settings.collectionId)?.name ?? null
            : null
        }
      />

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSettingsChange={setSettings}
          collections={collections}
          onClose={() => setShowSettings(false)}
        />
      )}

      {selectedSource && (
        <SourceModal
          source={selectedSource}
          onClose={() => setSelectedSource(null)}
        />
      )}
    </div>
  );
}
