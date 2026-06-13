# Skill: Art DeCC0s

10,000 richly-written characters (the MOCA Codex) — queryable through the
MOCA API, aggregated live from the DeCC0s knowledge base.

## List & search

```bash
curl -H "X-API-Key: $KEY" \
  "https://api.moca.qwellco.de/v1/decc0s?search=Cairo&limit=10"
```

List items are lightweight: `id` (= token id 1–10000), `name[]`,
`description`, `ancestor`, `decc0_type`, `dna1..dna4`,
`cultural_affiliation`, `philosophical_affiliation`, `owner` (eth address),
`soul`, `multiplicity`, resolved `thumbnail_url` / `thumbnail_character_url` /
`thumbnail_background_url`, `image_ipfs_url`. Custom field sets via
`?fields=id,name,owner`.

## Full record

```bash
curl -H "X-API-Key: $KEY" \
  "https://api.moca.qwellco.de/v1/decc0s/1?include=profiles,codex"
```

- Default: ~70 fields — biography, characterization, confession, writing
  style (`writing_*`, `ideolectal_words`), favorites, geography, mood.
- `include=profiles` adds the heavyweight blobs: `agent_profiles`
  (versioned: adjectives, bio[], knowledge[], style rules) and the character's
  **SOUL.md** (a ready-made persona). Hundreds of KB — only ask when needed.
- `include=codex` embeds `codex_document` (the character's lore file).

## Build an agent from a DeCC0

```js
const d = (await get(`/v1/decc0s/${id}?include=profiles`)).data;
const persona = d.moltbot?.["v0.1"]?.soul          // ready-made SOUL.md
  ?? [d.description, ...(d.biography ?? []), d.writing_flavor].join("\n");
// → use as system prompt; ground answers with /v1/library/ask
```

For *signed, portable* identities see `/skills/souls/SKILL.md` — souls and
DeCC0 records are complementary (structured data vs. attested document).

## Notes

- Aggregated from api.decc0s.com with ~5 min server cache.
- Deep Directus-style querying (filters/sorts) is available on the upstream
  directly: https://docs.decc0s.com (own conventions, no MOCA key).
