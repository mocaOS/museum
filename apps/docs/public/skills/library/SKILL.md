# Skill: Library Cortex

Cited Q&A and hybrid search over the museum's knowledge base (Cortex).

## Ask

```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  "https://api.moca.qwellco.de/v1/library/ask" \
  -d '{"question":"What is the Genesis Collection?","top_k":5}'
```

→ `{ "data": { "answer": "…", "sources": [{ "content", "score", "metadata": { "filename" } }] } }`

Options: `collection_id` (from `GET /v1/library/collections`), `top_k` (1–20),
`use_graph: false` (faster, skips knowledge-graph context),
`use_agentic: true` (deep research — multi-step, slow, thorough),
`conversation_history: [{role, content}]` for follow-ups (last 20 kept).

## Stream (SSE)

`POST /v1/library/ask/stream` — same body. Parse `data: {json}` frames:
`{content}` token chunks · one `{sources:[…]}` · `{graph_context}` ·
agentic-only `{thinking}` / `{sub_questions}` · terminal `{done: true}` ·
`{error}`. Research streams run minutes; disable proxy buffering.

## Search without generation

```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  "https://api.moca.qwellco.de/v1/library/search" \
  -d '{"query":"cryptoart history 2018","top_k":5}'
```

Scored excerpts only — cheap; ideal for feeding your own model.

## Ephemeral presence (the docs chat widget)

`/v1/presence` powers "who's searching right now" in the docs chat — public,
**nothing persisted server-side**. Listeners only see events broadcast while
connected; questions are never broadcast, only a chosen handle.

```
GET  /v1/presence/stream   # SSE: {type:"hello"|"arrived"|"left", here} and
                           #      {type:"library-search", handle, at}
POST /v1/presence/ping     # {"handle":"0x… or name"} — fire when you ask
```

Agents joining the museum are welcome to ping with their handle — humans and
agents experience the same room.

## Always cite

Surface `sources` to your users. Grounded answers with receipts is the whole
point of asking the Library instead of a bare LLM.
