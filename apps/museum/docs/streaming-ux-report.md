# Streaming UX report — `/api/ask/stream`

**For:** Cortex backend team (`library-backend` / `cortex-app`)
**From:** Cortex Chat frontend
**Date:** 2026-06-08
**Status:** request for backend changes

---

## TL;DR

The chat feels like it might be **stuck** in the seconds between "send" and the
first answer token. We've improved the *frontend* to mask this (a live blinking
indicator, a staged status label, and an elapsed-seconds counter — shipped, see
"What the frontend now does" below), but the underlying cause is on the backend:

1. **Chat mode is silent before the first token.** The standard pipeline runs
   search + reranking with **zero events emitted** for ~2–10 s, then sends
   `sources`, then `content`. The client has nothing to render but a placeholder.
2. **There is no heartbeat / keep-alive.** Long silent windows risk idle
   timeouts in proxies/load balancers, and the client can't distinguish "still
   working" from "connection died".
3. **There is no generic `status`/`stage` event.** Progress is only inferable
   from `thinking`/`retrieval`, which Chat mode never sends.

We're asking for three additive, backward-compatible changes: **(A)** emit a
`status` event at each pipeline stage (including in Chat mode), **(B)** emit SSE
heartbeats during silent windows, **(C)** wire up the already-defined
`stream_reasoning_steps` setting. Details and exact code locations below.

---

## How the frontend consumes the stream (so you know what's safe)

- The browser calls our Next.js proxy `POST /api/ask/stream`
  (`src/app/api/ask/stream/route.ts`), which forwards to your
  `${CORTEX_API_URL}/api/ask/stream` with `Accept-Encoding: identity` (we rely
  on **uncompressed** SSE — gzip causes the browser to buffer chunks and breaks
  real-time streaming; please don't force compression on this endpoint).
- The client parser (`src/lib/api.ts`, `askQuestionStream`) reads `data: <json>`
  lines and dispatches by **field presence**. It currently reacts to these
  fields, and **ignores any field it doesn't recognize** (so new fields are safe
  to add):

  | Field on the JSON object | Frontend reaction |
  |---|---|
  | `content` (string) | appended to the answer |
  | `sources` (array) | rendered as citation chips |
  | `graph_context` (object) | stored (entities/relationships) |
  | `thinking` (string) | appended to the "Thinking" step list |
  | `sub_questions` (array) | rendered as "Research areas" |
  | `retrieval` (string) | shown as live retrieval progress |
  | `retrieval_stats` (object) | stored |
  | `skill_tool` (string) + `skill_name` | **now** folded into the thinking list (we just added this — it was previously dropped) |
  | `done` (true) | finalizes the message |
  | `error` (string) | shown as an error |

  Anything else (e.g. a new `status` field, or SSE `:` comment lines) is
  silently skipped today and will be picked up once we add handling — so you can
  ship the backend changes first without breaking the current client.

---

## Where the silence comes from (code-grounded)

All line numbers are in `cortex-app/backend/`.

### Chat mode — the worst case (the default mode users are in)

`app/main.py` → standard streaming path (~`main.py:2244-2411`). The generator:

1. prompt-injection check,
2. **graph/hybrid search** (`graph_search_async` / hybrid; 2–5 s on large graphs),
3. **reranking** (cross-encoder; 1–3 s),
4. formats sources, then finally:

```python
yield f"data: {json.dumps({'sources': sources})}\n\n"          # ~main.py:2321  ← first event
...
yield f"data: {json.dumps({'content': content})}\n\n"          # ~main.py:2396
yield f"data: {json.dumps({'done': True})}\n\n"                 # ~main.py:2398
```

**Nothing is emitted during steps 1–3.** That is the 2–10 s "is it stuck?"
window users are reporting. Chat mode never sends `thinking` or `retrieval`, so
the client has no stage information at all.

### Agentic / Deep Research — better, but still has silent gaps

`app/services/document_processor.py` → `agentic_rag_stream()` (~`:3246`) emits
`thinking` early and often:

```python
yield {"thinking": "Analyzing question complexity..."}          # ~:3301
yield {"sub_questions": sub_questions}                           # ~:3329
yield {"thinking": "Searching knowledge graph communities..."}  # ~:3333
# per sub-question:
yield {"thinking": f"Researching ({i+1}/{len(sub_questions)})..."}
yield {"retrieval": f"Found {len(results)} sources for sub-question {i+1}"}
...
yield {"sources": sources}                                       # ~:3436
yield {"content": ...}                                           # ~:3522
yield {"done": True, ...}                                        # ~:3526
```

`app/services/researcher_agent.py` → `agent_rag_stream()` (~`:1100`) similarly
opens with `{"thinking": "Starting research..."}` (~`:1136`) and maps
`thinking` / `retrieval` / `skill_tool` from the researcher loop.

The remaining gaps here are the **silent LLM calls**: each researcher-loop model
call (e.g. `researcher_agent.py` ~`:426`) and the initial decomposition LLM call
run with no event between "about to call" and "got a response" — 2–10 s each.

### Confirmed: no heartbeat, and `stream_reasoning_steps` is dead

- No SSE comment/`:`-line pings, no periodic null events, no per-generator
  timeout guard. Only the HTTP `Connection: keep-alive` header is set
  (`StreamingResponse`, e.g. `main.py:2135/2241/2409`).
- `stream_reasoning_steps: bool = Field(default=True)` exists
  (`app/config.py` ~`:427`) and is surfaced in the admin config endpoint
  (~`main.py:3995`) but is **never read** in the streaming paths.

---

## What the frontend now does (already shipped, mitigation only)

While an assistant message is streaming but no `content` has arrived, we render a
`ThinkingIndicator` (`src/components/ThinkingIndicator.tsx`) with:

- a **blinking accent-color dot** (motion = "alive"),
- a **staged label** derived from whatever events have arrived
  (`Connecting…` → `Searching the knowledge base…` → `Researching…` →
  `Writing the answer…`),
- a **live elapsed-seconds counter**, and
- a reassurance line after 12 s.

This makes the silence *tolerable*, but the labels are guesses inferred from
field presence. With real backend `status` events we can show **accurate**
stages, and with heartbeats we can stop worrying about idle timeouts.

---

## Requests

### A. Emit a `status` event at each pipeline stage — **in every mode, including Chat**

A single new field, additive and ignorable by old clients. Proposed shape:

```python
yield {"status": {"stage": "searching",  "message": "Searching the knowledge base"}}
yield {"status": {"stage": "reranking",  "message": "Ranking the most relevant sources"}}
yield {"status": {"stage": "generating", "message": "Writing the answer"}}
```

Suggested `stage` vocabulary (stable machine keys; `message` is the
human/i18n-friendly text): `queued`, `analyzing`, `searching`, `reranking`,
`graph`, `researching`, `consolidating`, `generating`.

**Highest-value insertion point:** Chat mode in `main.py` — emit
`{"status": {"stage": "searching", ...}}` *before* `graph_search_async`
(~`main.py:2279`) and `{"stage": "reranking"}` before reranking (~`main.py:2303`),
and `{"stage": "generating"}` right before the content loop (~`main.py:2390`).
This is ~3 `yield`s and removes the entire silent window for the default mode.

For agentic paths, the existing `thinking` events already serve this purpose;
adding the structured `stage` key alongside them is a nice-to-have for accurate
UI labels but not required.

### B. Emit SSE heartbeats during silent windows

A comment line (`": ping\n\n"`) every ~5–10 s when no other event has been sent
keeps intermediaries from idle-timing-out and confirms liveness. Comment lines
are ignored by the SSE spec and by our parser today, so this is safe to add now.

Cleanest implementation is a small async wrapper that races the real generator
against a timer, e.g.:

```python
async def with_heartbeat(gen, interval=8.0):
    queue: asyncio.Queue = asyncio.Queue()
    async def pump():
        async for ev in gen:
            await queue.put(ev)
        await queue.put(_DONE)
    task = asyncio.create_task(pump())
    while True:
        try:
            ev = await asyncio.wait_for(queue.get(), timeout=interval)
        except asyncio.TimeoutError:
            yield ": ping\n\n"          # keep-alive; no data event
            continue
        if ev is _DONE:
            break
        yield f"data: {json.dumps(ev)}\n\n"
```

Wrap each `StreamingResponse(generate_*())` with it. The biggest win is around
the **silent LLM calls** in the researcher loop (`researcher_agent.py` ~`:426`)
and the **Chat-mode search/rerank** block.

### C. Wire up `stream_reasoning_steps`

Either honor the setting (gate the `thinking`/`status` emissions on it) or remove
it, so configuration matches behavior. Today it's defined and admin-visible but
inert (`config.py` ~`:427`, `main.py` ~`:3995`).

### D. (Investigate) Reduce time-to-first-token

The 10 s reports are mostly Chat mode's pre-token search+rerank. Worth checking:
can reranking stream/short-circuit, and is graph traversal the dominant cost for
the typical query? Even partial improvement plus (A)/(B) would resolve the
"stuck" perception.

---

## Acceptance / how we'll validate

Once (A) and (B) land we'll:

1. handle the `status` field in `src/lib/api.ts` and drive `ThinkingIndicator`
   labels from `status.message` (falling back to the current heuristic),
2. confirm via the live docker instance that Chat mode shows a moving stage
   within ~500 ms of send and a heartbeat at least every ~10 s,
3. confirm no regression when a client ignores the new field (old build).

Nothing here is breaking: every change is an additive field or an SSE comment
line, both already tolerated by the current client.

---

## Appendix — current event reference (reverse-engineered)

Event order observed today, per mode:

- **Chat (standard):** `sources` → `content`* → `done`. *(silent before `sources`)*
- **Deep Research (legacy agentic):** `thinking`* → `sub_questions` → `thinking`*
  → (`thinking`/`retrieval` per sub-question)* → `sources` → `graph_context`? →
  `retrieval_stats` → `thinking` → `content`* → `done`.
- **Deep Research (agent):** `thinking` ("Starting research…") →
  (`thinking`/`retrieval`/`skill_tool`)* → `sources` → `graph_context`? →
  `retrieval_stats` → `content`* → `done`.
- **Fast search:** `content`* → `done` (`fast_mode: true`).
- **Any:** `error` (string) on failure.

(`*` = repeats / streamed; `?` = optional.) Please keep `done` (and `error` on
failure) **terminal and guaranteed** — the client finalizes on them.
