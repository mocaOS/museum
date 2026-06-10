# Skill: Artworks & media

How to query and *correctly render* the museum's artworks.

## Query

```bash
# Browse a collection (slug from /v1/collections)
curl -H "X-API-Key: $KEY" \
  "https://api.moca.qwellco.de/v1/artworks?collection=genesis&page=1&limit=50"

# Search by title or artist
curl -H "X-API-Key: $KEY" \
  "https://api.moca.qwellco.de/v1/artworks?search=butterfly"
```

## The artwork shape

```json
{
  "id": 3643,
  "name": "Tree of Origins",
  "artist_name": "…",
  "collection": "genesis",
  "media":     { "url": "…", "type": "image", "width": 1026, "height": 1431 },
  "animation": null,
  "ratio": 0.717,
  "opensea_url": "…"
}
```

## The rules that matter

1. **Never assume squares.** `media.url` points at the ORIGINAL file (the API
   already swapped square-cropped CDN variants). Render at `ratio`
   (width/height) or let the decoded file's own pixels win.
2. **`ratio: 1` means unknown OR genuinely square** — when it matters,
   measure the decoded image (`naturalWidth/naturalHeight`).
3. **Video works**: `animation` is non-null → render `animation.url` as a
   muted, looping video at `ratio`. The still `media` may be null for
   video-only pieces.
4. **Originals are heavy** (multi-MB, IPFS). For thumbnails resize through
   your own proxy/CDN; never ship originals to a grid view.
5. `width`/`height` are layout hints; absent means trust the file.

## Collections

`GET /v1/collections` returns published top-level collections with
`child_collections`. Use any `slug` (comma-separate for multiple) as the
`collection` filter. `meta.total` on /v1/artworks drives pagination
(`page * limit >= total` → done).
