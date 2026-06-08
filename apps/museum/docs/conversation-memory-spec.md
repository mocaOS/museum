# Conversation memory & compaction — spec + build brief

**For:** Cortex backend team (`cortex-app/backend`)
**From:** Cortex Chat frontend
**Date:** 2026-06-08
**Status:** proposal to build — hand this to the backend agents

---

## 1. Why (the problem, code-grounded)

Today the agent's only "memory" is the raw `conversation_history` the client
resends each turn, hard-truncated to the **last 6 messages** (3 turns):

```python
# researcher_agent.py:406 and :1335, document_processor.py:2810, main.py:2171
for msg in conversation_history[-settings.max_conversation_history:]:
    messages.append({"role": msg.role, "content": msg.content})
```

Three consequences:

1. **Correctness:** past 3 turns, earlier context is *silently dropped*. The
   agent forgets constraints, prior conclusions, and which sources it already
   cited. Follow-ups like "expand on the second point" or "and what about the
   GDPR angle you mentioned" degrade.
2. **Latency & cost:** the full (truncated) history is fed to the LLM **twice**
   per turn — once to the researcher/decomposition step, once to the writer —
   and it grows every turn until it's chopped. No token budgeting exists
   (`config.py`: `openai_max_context=32768`, item-count caps only).
3. **Citations don't persist:** `[src_N]` markers are generated per request
   (`researcher_agent.py:1226-1234`, `document_processor.py:2781-2790`), so a
   source cited in turn 2 has no stable identity in turn 5.

**Goal:** bound the per-turn context to a fixed, small budget regardless of
conversation length, while *preserving* the facts, conclusions, and source
references needed to answer correctly — and use the freed budget + a memory
fast-path to make answers **faster**.

---

## 2. Design in one line

Keep the **last K turns verbatim**; fold everything older into a small set of
**memory buckets**; rebuild a compact context each turn from `buckets + verbatim
window + freshly retrieved sources`. Compaction runs **after** the answer
streams, so it never adds user-visible latency.

### Where the memory lives — recommended: client-carried, backend-computed

The backend stays **stateless** (consistent with today). We add:

- a new **optional** request field `conversation_memory` (the buckets), which
  the client persists and resends, and
- a new terminal SSE event **`memory_update`** carrying the recomputed buckets,
  which the client stores for next turn.

The **compaction logic lives in the backend** (that's the integration you're
building); only *storage* stays on the client — and cortex-chat already persists
chat sessions, so it's a tiny add there. This is fully backward-compatible: if
`conversation_memory` is absent, behave exactly as today.

> Alternative (not recommended for v1): a server-side session store keyed by a
> new `conversation_id` (redis/sqlite). More infra, duplicates storage cortex-chat
> already owns, and breaks the stateless model. Call it if you'd rather own
> sessions server-side; the bucket design below is identical either way.

---

## 3. The memory buckets (per conversation)

Multiple small, purpose-specific buckets — each independently size-capped:

```jsonc
{
  "version": 1,
  "turn_count": 7,

  // Rolling natural-language summary of everything older than the verbatim
  // window. Updated incrementally, never regenerated from scratch. ~150 words.
  "summary": "User is evaluating Cortex for GDPR-compliant doc search. Established that ...",

  // Durable, atomic facts / decisions / constraints the user or agent locked in.
  // Survive for the whole conversation. Cap ~20 items.
  "facts": [
    "User's deployment is EU-only (Frankfurt).",
    "Decided against the legacy agentic path; using agent-research mode.",
    "Answer language: German (du-form)."
  ],

  // Threads raised but not yet resolved (e.g. deep-research sub-questions still open).
  "open_questions": ["Cost impact of reranking at 100 req/s — not yet answered."],

  // Source ledger: every source cited so far, with a CONVERSATION-STABLE id.
  // This is what preserves citations + enables answering follow-ups WITHOUT
  // re-retrieval. Cap ~30, evict by least-recently-referenced.
  "source_ledger": [
    {
      "sid": "S1",                       // stable across the whole conversation
      "document_id": "doc_abc",
      "chunk_id": "chunk_123",
      "filename": "gdpr-overview.pdf",
      "gist": "Art. 17 right-to-erasure applies to derived embeddings.",
      "last_turn": 2
    }
  ],

  // Conversation-scoped intent / preferences. Helps the writer answer fast in the
  // right shape without re-deriving it each turn.
  "intent": "Wants concise, source-backed answers; technical depth; German.",

  "tokens_estimate": 850
}
```

Every bucket is optional and individually bounded, so the **total memory block
has a hard token ceiling** (target: ≤ ~1.5k tokens) no matter how long the chat.

---

## 4. Per-turn lifecycle

```
        ┌─ request: question + conversation_memory + last-K verbatim turns ─┐
        ▼                                                                   │
 (1) BUILD CONTEXT  ── render memory block + verbatim window                │
        ▼                                                                   │
 (2) DECIDE: memory fast-path?  ── if question is answerable from           │
        │     summary+facts+source_ledger, SKIP retrieval (fast TTFT)       │
        ▼                                                                   │
 (3) RETRIEVE (only if needed) ── normal hybrid/graph search + rerank       │
        ▼                                                                   │
 (4) WRITE  ── writer sees: system + memory block + verbatim turns          │
        │           + this-turn sources (src_N) + question  → stream answer │
        ▼                                                                   │
 (5) EMIT  ── stream `content`, then `sources` for THIS turn, then          │
        │     `memory_update` (recomputed buckets), then `done`             │
        ▼                                                                   │
 (6) COMPACT (post-stream, OFF the critical path) ── one cheap LLM call:    │
              fold the exchange + any turn evicted from the verbatim window │
              into the buckets → that's what `memory_update` carries ───────┘
```

Crucial for speed: **step 6 happens after the user already has their answer.**
The compaction model can be a small/fast model (new flag `memory_compaction_model`).
It's *incremental* — it only digests the new exchange + the one evicted turn, not
the whole history — so it's cheap and bounded.

### Context assembly (replaces the raw `[-6:]` slice)

```
[system prompt]
[MEMORY]                      ← rendered buckets (summary, facts, open Qs,
                                 source-ledger gists, intent)
[last K verbatim turns]       ← K≈4, kept raw for local coherence
[this turn's retrieved sources, numbered src_1..src_N]
[user question]
```

Apply the **same assembled context to both** the researcher step and the writer
step (today they each re-slice history independently — unify it).

---

## 5. Citation continuity (the part to get right)

`[src_N]` is per-request and the frontend renders `[src_N]` against the
`sources` array of *that* message. To keep that contract intact while letting
the agent reference earlier sources:

1. The **source ledger** holds a conversation-stable `sid` (S1, S2, …) plus the
   real `document_id`/`chunk_id`.
2. When the writer (or fast-path) reuses a ledger source, **re-include it in
   this turn's `sources` event** and assign it a fresh `src_N` for this turn.
   The writer cites `[src_N]` as usual.
3. So: **every turn's `sources` SSE event must contain exactly the sources its
   answer cites** (freshly retrieved *and* ledger-reused), numbered for that
   turn. The frontend then renders chips with zero changes.
4. The ledger's job is purely backend memory: avoid re-retrieving a known
   source and let the writer ground a follow-up. The stable `sid` is internal;
   the wire still speaks `src_N`.

Net: **no frontend citation changes required** — just keep the invariant
"answer's `[src_N]` ↔ this turn's `sources` array."

---

## 6. How this improves UX

- **Faster every turn:** context is a fixed ~1.5k-token memory block + 4 raw
  turns instead of an ever-growing history fed twice. Fewer prompt tokens →
  lower TTFT and cost on the researcher *and* writer calls.
- **Fast-path for follow-ups:** when a question is answerable from
  summary+ledger, skip retrieval entirely → big TTFT win on conversational
  follow-ups ("summarize that", "why?", "in German").
- **Correct on long chats:** conclusions, constraints, and cited sources survive
  the whole conversation instead of vanishing after 3 turns.
- **Stable, trustworthy citations:** a source cited in turn 2 can be referenced
  again in turn 8 with its content intact.
- **Zero added latency:** compaction is post-answer and incremental.

---

## 7. API & config changes

**Request** (`models.py` `RAGRequest`) — add optional, backward-compatible:
```python
conversation_memory: Optional[ConversationMemory] = Field(default=None)
verbatim_turns: Optional[int] = Field(default=None)  # else use config
```

**New SSE event** on `/api/ask/stream` (and field on `/api/ask` JSON response):
```python
yield {"memory_update": <ConversationMemory dict>}   # emit right before {"done": true}
```
(Old clients ignore unknown fields — safe to ship before the frontend handles it.)

**Config** (`config.py`):
```python
enable_conversation_memory: bool = Field(default=False)   # gate the whole feature
memory_token_budget: int      = Field(default=1500)       # ceiling for the memory block
verbatim_turns_kept: int      = Field(default=4)          # raw turns kept before folding
memory_compaction_model: str  = Field(default="<small-fast-model>")
memory_fast_path: bool        = Field(default=True)       # allow skipping retrieval
```

Keep `max_conversation_history` as the fallback when the feature is off.

---

## 8. Rollout

- **Phase 1 — summary + verbatim window.** Add buckets infra, the
  `summary` bucket, incremental post-turn compaction, `memory_update` event.
  Behind `enable_conversation_memory`. No fast-path yet, no ledger reuse.
- **Phase 2 — source ledger + citation continuity.** Section 5.
- **Phase 3 — memory fast-path.** Skip retrieval when answerable from memory.
- **Phase 4 — facts/open_questions/intent buckets + token budgeting** to
  replace the item-count caps.

Each phase is independently shippable and falls back to today's behavior when
the flag is off or `conversation_memory` is absent.

---

## 9. Decisions for the backend team

1. **Storage:** client-carried (recommended, §2) vs server-side session store?
2. **Compaction model:** which small/fast model for step 6?
3. **Fast-path gate:** a cheap classifier turn, or let the researcher decide
   "no search needed" given the ledger? (The agent loop can already choose not
   to search — feeding it the ledger may be enough.)
4. **Verbatim window K** and **memory token budget** defaults.

---

# Build brief — paste this to your backend coding agents

> **Task:** Add a conversation-memory + compaction layer to the Cortex RAG agent
> so per-turn LLM context is bounded regardless of conversation length, while
> preserving facts, conclusions, and cited sources — and use the freed budget to
> answer follow-ups faster.
>
> **Today:** the agent is stateless and hard-truncates `conversation_history` to
> the last 6 messages (`researcher_agent.py:406` & `:1335`,
> `document_processor.py:2810`, `main.py:2171`). No summarization, no memory, no
> token budgeting. `[src_N]` citations are per-request
> (`researcher_agent.py:1226`, `document_processor.py:2781`).
>
> **Build:**
> 1. A `ConversationMemory` model with buckets: `summary`, `facts[]`,
>    `open_questions[]`, `source_ledger[]` (each item has a conversation-stable
>    `sid` + `document_id`/`chunk_id`/`filename`/`gist`/`last_turn`), `intent`.
>    Each bucket independently size-capped; whole block ≤ `memory_token_budget`.
> 2. Add optional `conversation_memory` to `RAGRequest`
>    (`models.py:267`). Backward-compatible — absent ⇒ current behavior.
> 3. Replace the raw `[-max_history:]` slices with a single context builder:
>    `system + rendered_memory_block + last_K_verbatim_turns + this_turn_sources
>    + question`. Use it for BOTH the researcher and writer steps (unify the two
>    current independent slices).
> 4. After streaming the answer, run ONE incremental compaction LLM call (small
>    fast model = `memory_compaction_model`) that folds the new exchange + the
>    turn evicted from the verbatim window into the buckets. Emit the result as a
>    `memory_update` SSE event right before `done`. This must NOT block the
>    answer stream.
> 5. Citation invariant: every turn's `sources` event must contain exactly the
>    sources its `[src_N]` markers reference — freshly retrieved AND ledger-reused
>    — numbered for that turn. Internally map stable `sid` → per-turn `src_N`. Do
>    not change the wire citation format.
> 6. (Phase 3) Memory fast-path: if the question is answerable from
>    `summary + facts + source_ledger`, skip retrieval for a fast time-to-first-token.
> 7. Gate everything behind `enable_conversation_memory`; add the config flags in
>    §7. Ship phases independently (§8).
>
> **Constraints:** no frontend-breaking changes (unknown SSE fields are ignored
> today; the citation invariant is preserved). Keep `/api/ask` and
> `/api/ask/stream` behavior identical when the flag is off.

---

# The compaction prompt (step 6) — drop-in template

Use a cheap/fast model. Input is the current buckets + the just-finished
exchange + any evicted turn. Output is the **updated buckets only**, as JSON.

```
SYSTEM:
You maintain a compact, faithful memory of an ongoing conversation between a
user and a knowledge-base research assistant. You will be given the CURRENT
MEMORY (JSON buckets) and the LATEST EXCHANGE (the user turn(s) and the
assistant's answer, including the sources it cited). Update the memory so a
future turn can answer correctly with a minimal context window.

Rules:
- Output ONLY the updated memory as JSON matching the given schema. No prose.
- summary: rewrite as a single tight paragraph (≤150 words) covering the whole
  conversation so far. Preserve decisions, constraints, and conclusions. Drop
  chit-chat and anything already captured in facts/source_ledger.
- facts: keep durable, atomic statements (user constraints, decisions, locked
  conclusions). Merge duplicates. Never invent. Cap 20; drop least-relevant.
- open_questions: add threads raised but unanswered; remove ones now answered.
- source_ledger: for each source the latest answer CITED, ensure an entry exists
  with a stable `sid` (reuse if document_id+chunk_id already present, else assign
  the next S<n>), a one-line factual `gist` of what it established, and
  `last_turn`. Cap 30; evict least-recently-referenced. Never fabricate sources.
- intent: keep/refine a one-line statement of the user's goal and preferred
  answer style/language.
- Be faithful: every fact and gist must be grounded in the actual exchange or
  prior memory. If unsure, omit.

USER:
CURRENT MEMORY:
{memory_json}

LATEST EXCHANGE:
[user]: {user_turn(s)}
[assistant]: {assistant_answer}
[cited sources this turn]:
{for each cited source: sid?, document_id, chunk_id, filename, short content}

EVICTED TURN (now leaving the verbatim window, fold into summary/facts):
{evicted_turn_or_"none"}

Return the updated memory JSON.
```

---

## Appendix — files the backend will touch

- `backend/app/models.py:261-276` — `RAGRequest`, `ConversationMessage` (+ new `ConversationMemory`)
- `backend/app/config.py:295` — `max_conversation_history` (+ new memory flags §7)
- `backend/app/services/researcher_agent.py:398-408, 1226-1234, 1321-1352` — researcher + writer context assembly, source formatting, writer call
- `backend/app/services/document_processor.py:2781-2813, 3187-3209` — legacy path source formatting + writer
- `backend/app/services/research_prompts.py:455-590` — system/user prompt templates (memory block slots in here)
- `backend/app/main.py:1961-2014, 2101-2124` — `/api/ask` + `/api/ask/stream` (thread memory through; emit `memory_update`)
