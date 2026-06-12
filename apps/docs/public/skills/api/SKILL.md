# Skill: MOCA API fundamentals

Ground truth for calling `https://api.moca.qwellco.de/v1`.

## Auth

Every endpoint except `GET /v1` and `/v1/presence/*` requires a key:

```
X-API-Key: moca_<48 hex>        # or: Authorization: Bearer moca_…
```

Keys are issued by the MOCA team. Keep them server-side.

## Envelope

- Success: `{ "data": <payload>, "meta": { … }? }`
- Error: `{ "errors": [{ "message": "…", "extensions": { "code": "UNAUTHORIZED|NOT_FOUND|BAD_REQUEST|RATE_LIMITED|UPSTREAM|UNCONFIGURED|INTERNAL" } }] }`

## Rate limits

120 requests/minute per key (sliding window). Watch `X-RateLimit-Remaining`;
on 429 honor `Retry-After: 60`. Museum data changes slowly — cache.

## Endpoints

```
GET  /v1                                  # index (no key)
GET  /v1/collections                      # published collections + children
GET  /v1/collections/:slug
GET  /v1/artworks?collection&search&page&limit   # max limit 100
GET  /v1/artworks/:id
GET  /v1/rooms                            # 3D rooms: image_url, model_url (HQ GLB), model_optimized_url (GLB w/ slots), slots
GET  /v1/decc0s?page&limit&search&fields
GET  /v1/decc0s/:id?include=profiles,codex
GET  /v1/search?q=&limit                  # grouped: artworks+collections+decc0s
POST /v1/library/ask                      # RAG Q&A {question, collection_id?, top_k?, use_agentic?}
POST /v1/library/ask/stream               # same, SSE
POST /v1/library/search                   # retrieval only {query, top_k?}
GET  /v1/library/collections
GET  /v1/souls/:chainId/:contract?page&limit
GET  /v1/souls/:chainId/:contract/:tokenId
GET  /v1/presence/stream                  # public ephemeral SSE (see library skill)
POST /v1/presence/ping                    # public {handle?}
```

## Smoke test

```bash
curl https://api.moca.qwellco.de/v1                       # no key needed
curl -H "X-API-Key: $KEY" https://api.moca.qwellco.de/v1/collections
```

Full schemas: https://docs.museumofcryptoart.com/api (OpenAPI).
