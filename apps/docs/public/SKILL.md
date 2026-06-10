# MOCA Skills

The missing knowledge layer between AI agents and the Museum of Crypto Art.
Fetch the skill you need before writing an integration — ground truth beats
training data. Inspired by [ethskills.com](https://ethskills.com/) and
[cortexskills.org](https://cortexskills.org/); everything MOCA under one
umbrella.

Base URL for all skills: `https://docs.museumofcryptoart.com`

## Index

| Skill | Fetch | Teaches |
| --- | --- | --- |
| API fundamentals | `/skills/api/SKILL.md` | Auth, envelope, rate limits, every endpoint |
| Artworks & media | `/skills/artworks/SKILL.md` | Collections, artworks, original-ratio media handling |
| Art DeCC0s | `/skills/decc0s/SKILL.md` | The 10,000-entity knowledge base, personas, codex docs |
| The Library | `/skills/library/SKILL.md` | RAG ask/stream/search with citations |
| Souls & web3 | `/skills/souls/SKILL.md` | SOUL files, EIP-191 verification, ERC-8004/8183/8257 |
| Exhibitions & Hyperfy | `/skills/exhibitions/SKILL.md` | 3D rooms, slot convention, spawning walkable worlds |

## Machine-readable everything

- `https://docs.museumofcryptoart.com/llms.txt` — docs index for LLMs
- `https://docs.museumofcryptoart.com/llms-full.txt` — full docs in one file
- `https://docs.museumofcryptoart.com/api` — interactive OpenAPI reference
- Sibling ecosystems: `https://docs.decc0s.com/llms-full.txt` (Art DeCC0s),
  `https://docs.cortex.eco/llms-full.txt` (Cortex), `https://cortexskills.org/SKILL.md`,
  `https://ethskills.com/SKILL.md`

## The 30-second orientation

The **MOCA API** (`https://api.moca.qwellco.de/v1`) is one key-gated surface
over the whole museum: collections, artworks (original files, trusted
ratios), 3D exhibition rooms (GLB + `Slot_NNN` convention), the Art DeCC0s
knowledge base, the Library (RAG with citations), and Souls (signed agent
identities). Responses use `{ "data": …, "meta": … }`; errors use
`{ "errors": [{ "message", "extensions": { "code" } }] }`. Send your key as
`X-API-Key`. Request keys from the MOCA team.

Tell your agent:

> Read https://docs.museumofcryptoart.com/SKILL.md, then fetch the skills you
> need for the task. Verify endpoints against /llms-full.txt before coding.
