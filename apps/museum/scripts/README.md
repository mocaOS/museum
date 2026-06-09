# scripts/

One-off operational scripts for the MOCA Museum app.

## optimize-rooms

Produce low-weight derivatives of the room GLB models (Draco geometry compression
+ WebP textures + dedup/weld/prune) for faster 3D room loading.

```bash
node scripts/optimize-rooms.mjs            # all rooms
node scripts/optimize-rooms.mjs --limit 5  # first 5 (smoke test)
```

Downloads each published room model from Directus, runs gltf-transform's `optimize`
(pulled on demand via `npx @gltf-transform/cli`), and writes results to `./optimized/`
with a size report. The R3F loader already decodes Draco + Meshopt (see
`Room3DViewer.tsx`), so optimized models drop in with no client changes.

## scrape-youtube

Refresh the MOCA video content pulled from YouTube. The **MOCA Live** page
(`/moca-live`) and the **Press Room → Artist Interviews** section render from
committed JSON, not a live API call — re-run this when there's new content
(especially livestreams, which we add continually).

```bash
node scripts/scrape-youtube.mjs            # refresh both
node scripts/scrape-youtube.mjs streams    # only livestreams → src/content/moca-live.json
node scripts/scrape-youtube.mjs videos     # only uploads     → src/content/press-room.json (artistInterviews)
```

No dependencies, no API key — Node ≥ 18 (global `fetch`).

| Source tab | Channel URL | Written to |
| --- | --- | --- |
| Livestreams | `@museumofcryptoartmc6354/streams` | `src/content/moca-live.json` → `streams[]` (`id`, `title`, `date`) |
| Uploads | `@museumofcryptoartmc6354/videos` | `src/content/press-room.json` → `artistInterviews[]` (`id`, `title`) |

`intro`/`spotify` (moca-live) and all other press-room keys are preserved — only
the scraped arrays are swapped. Any id present in `/streams` is excluded from the
`/videos` result so a livestream VOD never appears under Artist Interviews.

**How it scrapes** (no headless browser): GET the channel tab HTML with a desktop
UA + `Cookie: CONSENT=YES+1` (without the cookie the EU interstitial returns an
empty body); read the first page from the inlined `var ytInitialData = {…}`; then
page the rest via `POST youtubei/v1/browse` using the `INNERTUBE_API_KEY`, client
version, and `continuationCommand.token` from the page. Video id + title come from
`lockupViewModel` (current) or `videoRenderer` (legacy) nodes. Livestream dates
are read from each watch page's `"uploadDate":"YYYY-MM-DD"` microformat. Full
detail and a "when it breaks" checklist are in the header comment of
`scrape-youtube.mjs`.
