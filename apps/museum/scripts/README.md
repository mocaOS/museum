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
