import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { json as expressJson } from "express";
import { defineEndpoint } from "@directus/extensions-sdk";
import { createKeyAuth } from "./auth";
import { createCortexClient } from "./cortex";
import { createDecc0sClient } from "./decc0s";
import { registerGuideRoutes } from "./guide";
import { normalizeArtwork, type NftRow } from "./media";
import { registerPresenceRoutes } from "./presence";
import { createSoulsClient } from "./souls";
import { createVeniceClient } from "./venice";

/**
 * MOCA API v1 — the unified public API for integrators.
 *
 * One key, one surface: museum collections, artworks (with original-ratio
 * media), 3D rooms, and the Art DeCC0s knowledge base (aggregated from
 * api.decc0s.com). Served by Directus at /v1/* on api.moca.qwellco.de.
 *
 * Responses follow the Directus envelope ({ data, meta? } / { errors }) so
 * integrators who know the DeCC0s API feel at home. Documentation lives in
 * apps/docs (Zudoku) and the OpenAPI spec there is the source of truth for
 * the response shapes.
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

function intParam(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function errorJson(res: any, status: number, message: string, code: string) {
  return res.status(status).json({ errors: [{ message, extensions: { code } }] });
}

export default defineEndpoint({
  id: "v1",

  handler: (router, context) => {
    const { services, getSchema, env } = context;
    const { ItemsService } = services;
    const publicUrl = String(env.PUBLIC_URL || "").replace(/\/$/, "");
    const decc0s = createDecc0sClient(env);
    const cortex = createCortexClient(env);
    const souls = createSoulsClient(env);
    const venice = createVeniceClient(env);
    const requireKey = createKeyAuth({ services, getSchema, env });

    router.use(expressJson({ limit: "1mb" }));

    async function itemsService(collection: string) {
      const schema = await getSchema();
      return new ItemsService(collection, { schema });
    }

    const assetUrl = (id: string | null | undefined): string | null =>
      id ? `${publicUrl}/assets/${id}` : null;

    // ---- Public index (no key required) -----------------------------------
    router.get("/", (_req, res) => {
      res.json({
        data: {
          name: "MOCA API",
          version: "1.0",
          description:
            "Unified public API of the Museum of Crypto Art: collections, artworks, 3D rooms, and the Art DeCC0s knowledge base.",
          documentation: "https://docs.museumofcryptoart.com",
          authentication:
            "Send your MOCA API key as 'X-API-Key: <key>' or 'Authorization: Bearer <key>' on every request.",
          endpoints: [
            "GET /v1/collections",
            "GET /v1/collections/:slug",
            "GET /v1/artworks?collection&search&page&limit",
            "GET /v1/artworks/:id",
            "GET /v1/rooms",
            "GET /v1/rooms/:id/slots (public — baked slot anchors + resolved facing for the room's GLB)",
            "GET /v1/decc0s?page&limit&search",
            "GET /v1/decc0s/:id?include=profiles,codex",
            "GET /v1/search?q=",
            "POST /v1/library/ask",
            "POST /v1/library/ask/stream",
            "POST /v1/library/search",
            "GET /v1/library/collections",
            "GET /v1/souls/:chainId/:contractAddress?page&limit",
            "GET /v1/souls/:chainId/:contractAddress/:tokenId",
            "GET /v1/presence/stream (public, ephemeral)",
            "POST /v1/presence/ping (public, ephemeral)",
            "POST /v1/guide/exhibitions (public — register exhibition context for the in-world guide)",
            "GET /v1/guide/exhibitions/:id (public)",
            "GET /v1/guide/exhibitions/:id/suggestions (public)",
            "POST /v1/guide/ask (public — ask the museum guide a question)",
          ],
        },
      });
    });

    // Ephemeral presence (public — see presence.ts for the privacy model).
    registerPresenceRoutes(router);

    // The museum guide (public — the in-world visitor flow must be keyless;
    // see guide.ts for the rate limits and the enrichment pipeline).
    registerGuideRoutes(router, { itemsService, cortex, decc0s, souls, venice, publicUrl, errorJson });

    // ---- Room slot data (public) -------------------------------------------
    // Baked slot anchors + resolved facing for a room's builder GLB
    // (rooms.slot_data, written by apps/migration/bake-slot-data.ts). Public
    // like the guide: 3D clients hang artworks on these anchors without a key.
    router.get("/rooms/:id/slots", async (req, res) => {
      try {
        const id = Number.parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return errorJson(res, 400, "Invalid room id", "BAD_REQUEST");
        const svc = await itemsService("rooms");
        let rows: any[];
        try {
          rows = await svc.readByQuery({
            filter: { id: { _eq: id } },
            fields: ["id", "slot_data"],
            limit: 1,
          });
        } catch {
          // rooms.slot_data doesn't exist yet (pre-bake instance)
          return errorJson(res, 404, "No slot data baked for this room", "NOT_FOUND");
        }
        if (!rows.length) return errorJson(res, 404, "Room not found", "NOT_FOUND");
        if (!rows[0].slot_data) {
          return errorJson(res, 404, "No slot data baked for this room", "NOT_FOUND");
        }
        res.json({ data: rows[0].slot_data });
      } catch (e: any) {
        errorJson(res, 500, e?.message || "Internal error", "INTERNAL");
      }
    });

    // Everything below requires a valid MOCA API key.
    router.use(requireKey);

    // ---- Collections -------------------------------------------------------
    const COLLECTION_FIELDS = [
      "id",
      "name",
      "title",
      "description",
      "slug",
      "sort",
      "parent_collection",
      "child_collections.id",
      "child_collections.name",
      "child_collections.slug",
    ];

    function collectionView(c: any) {
      return {
        id: c.id,
        name: c.name,
        title: c.title ?? null,
        description: c.description ?? null,
        slug: c.slug,
        parent_collection: c.parent_collection ?? null,
        child_collections: (c.child_collections || []).map((ch: any) => ({
          id: ch.id,
          name: ch.name,
          slug: ch.slug,
        })),
      };
    }

    router.get("/collections", async (_req, res) => {
      try {
        const svc = await itemsService("collections");
        const rows = await svc.readByQuery({
          filter: {
            _and: [{ status: { _eq: "published" } }, { parent_collection: { _null: true } }],
          },
          sort: ["sort"],
          limit: -1,
          fields: COLLECTION_FIELDS,
        });
        res.json({ data: rows.map(collectionView) });
      } catch (e: any) {
        errorJson(res, 500, e?.message || "Internal error", "INTERNAL");
      }
    });

    router.get("/collections/:slug", async (req, res) => {
      try {
        const svc = await itemsService("collections");
        const rows = await svc.readByQuery({
          filter: {
            _and: [{ status: { _eq: "published" } }, { slug: { _eq: req.params.slug } }],
          },
          limit: 1,
          fields: COLLECTION_FIELDS,
        });
        if (!rows.length) return errorJson(res, 404, "Collection not found", "NOT_FOUND");
        res.json({ data: collectionView(rows[0]) });
      } catch (e: any) {
        errorJson(res, 500, e?.message || "Internal error", "INTERNAL");
      }
    });

    // ---- Artworks ----------------------------------------------------------
    const NFT_FIELDS = [
      "id",
      "name",
      "artist_name",
      "collection",
      "media_info",
      "display_media_info",
      "display_animation_info",
      "response_opensea",
    ];

    function nftFilter(slugs: string[] | null, search?: string) {
      const base: Record<string, unknown>[] = [{ media_info: { _null: false } }];
      if (slugs?.length) base.push({ collection_type: { slug: { _in: slugs } } });
      else base.push({ collection_type: { _null: false } });
      if (search?.trim()) {
        base.push({
          _or: [
            { name: { _icontains: search.trim() } },
            { artist_name: { _icontains: search.trim() } },
          ],
        });
      }
      return { _and: base };
    }

    router.get("/artworks", async (req, res) => {
      try {
        const page = intParam(req.query.page, 1, 1, 10_000);
        const limit = intParam(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
        const search = typeof req.query.search === "string" ? req.query.search : undefined;
        const collection =
          typeof req.query.collection === "string" && req.query.collection.trim()
            ? req.query.collection.split(",").map((s: string) => s.trim())
            : null;

        const svc = await itemsService("nfts");
        const filter = nftFilter(collection, search);
        const [rows, count] = await Promise.all([
          svc.readByQuery({
            filter,
            fields: NFT_FIELDS,
            limit,
            offset: (page - 1) * limit,
            sort: ["id"],
          }),
          svc.readByQuery({
            filter,
            aggregate: { count: ["id"] },
          }),
        ]);
        const total = Number(count?.[0]?.count?.id ?? 0);
        res.json({
          data: (rows as NftRow[]).map(normalizeArtwork),
          meta: { total, page, limit },
        });
      } catch (e: any) {
        errorJson(res, 500, e?.message || "Internal error", "INTERNAL");
      }
    });

    router.get("/artworks/:id", async (req, res) => {
      try {
        const id = Number.parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return errorJson(res, 400, "Invalid artwork id", "BAD_REQUEST");
        const svc = await itemsService("nfts");
        const rows = await svc.readByQuery({
          filter: { id: { _eq: id } },
          fields: NFT_FIELDS,
          limit: 1,
        });
        if (!rows.length) return errorJson(res, 404, "Artwork not found", "NOT_FOUND");
        res.json({ data: normalizeArtwork(rows[0] as NftRow) });
      } catch (e: any) {
        errorJson(res, 500, e?.message || "Internal error", "INTERNAL");
      }
    });

    // ---- Rooms (3D exhibition architecture) --------------------------------
    router.get("/rooms", async (_req, res) => {
      try {
        const svc = await itemsService("rooms");
        const baseFields = ["id", "title", "architect", "description", "series", "slots", "image", "model", "token_id"];
        // model_optimized = builder variant (draco/webp-optimized GLB with
        // embedded Slot_NNN placeholders; un_MUSEUMs get theirs generated
        // from the onchain slot amount; apps/migration/embed-room-slots.ts).
        // slot_data = baked slot anchors + resolved facing for that GLB
        // (apps/migration/bake-slot-data.ts), served per-room at
        // /v1/rooms/:id/slots. Both fields are created by their script's
        // first --write run — fall back gracefully on instances that
        // predate them.
        const fetchRooms = (extras: string[]) =>
          svc.readByQuery({ limit: -1, sort: ["id"], fields: [...baseFields, ...extras] });
        let rows: any[];
        try {
          rows = await fetchRooms(["model_optimized", "slot_data"]);
        } catch {
          try {
            rows = await fetchRooms(["model_optimized"]);
          } catch {
            rows = await fetchRooms([]);
          }
        }
        res.json({
          data: rows.map((r: any) => ({
            id: r.id,
            title: r.title ?? null,
            architect: r.architect ?? null,
            description: r.description ?? null,
            series: r.series ?? null,
            slots: r.slots ?? null,
            token_id: r.token_id ?? null,
            image_url: assetUrl(r.image),
            model_url: assetUrl(r.model),
            model_optimized_url: assetUrl(r.model_optimized),
            // Pointer instead of the inline JSON — slot_data runs to a few KB
            // per room and most list consumers don't need the anchors.
            slot_data_url: r.slot_data ? `${publicUrl}/v1/rooms/${r.id}/slots` : null,
          })),
        });
      } catch (e: any) {
        errorJson(res, 500, e?.message || "Internal error", "INTERNAL");
      }
    });

    // ---- Art DeCC0s (aggregated from api.decc0s.com) -----------------------
    router.get("/decc0s", async (req, res) => {
      try {
        const page = intParam(req.query.page, 1, 1, 10_000);
        const limit = intParam(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
        const search = typeof req.query.search === "string" ? req.query.search : undefined;
        const fields =
          typeof req.query.fields === "string" && req.query.fields.trim()
            ? req.query.fields.split(",").map((f: string) => f.trim())
            : undefined;
        const result = await decc0s.list({ page, limit, search, fields });
        if (result.status !== 200) {
          return errorJson(res, result.status, result.error || "Upstream error", "UPSTREAM");
        }
        res.json({ data: result.data, meta: result.meta });
      } catch (e: any) {
        errorJson(res, 502, e?.message || "DeCC0s upstream unavailable", "UPSTREAM");
      }
    });

    router.get("/decc0s/:id", async (req, res) => {
      try {
        const id = Number.parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return errorJson(res, 400, "Invalid DeCC0 id", "BAD_REQUEST");
        const include = String(req.query.include || "")
          .split(",")
          .map((s) => s.trim());
        const withProfiles = include.includes("profiles");
        const withCodex = include.includes("codex");

        const result = await decc0s.one(id, withProfiles);
        if (result.status !== 200) {
          return errorJson(
            res,
            result.status,
            result.error || "Upstream error",
            result.status === 404 ? "NOT_FOUND" : "UPSTREAM"
          );
        }

        // Optionally merge the character codex file (lore document) served by
        // this instance's /codex endpoint from the CODEX_DIR volume.
        let codexDocument: unknown;
        if (withCodex) {
          const codexDir = env.CODEX_DIR || path.resolve(process.cwd(), "codex");
          const file = path.join(codexDir, `Art_DeCC0_${String(id).padStart(5, "0")}.codex.json`);
          if (existsSync(file)) {
            try {
              codexDocument = JSON.parse(readFileSync(file, "utf8"));
            } catch {
              codexDocument = null;
            }
          } else {
            codexDocument = null;
          }
        }

        res.json({
          data: {
            ...result.data,
            ...(withCodex ? { codex_document: codexDocument } : {}),
          },
        });
      } catch (e: any) {
        errorJson(res, 502, e?.message || "DeCC0s upstream unavailable", "UPSTREAM");
      }
    });

    // ---- Unified search ----------------------------------------------------
    router.get("/search", async (req, res) => {
      try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (!q) return errorJson(res, 400, "Missing query parameter 'q'", "BAD_REQUEST");
        const limit = intParam(req.query.limit, 10, 1, 25);

        const [nftSvc, colSvc] = await Promise.all([
          itemsService("nfts"),
          itemsService("collections"),
        ]);
        const [artworks, collections, decc0sResult] = await Promise.all([
          nftSvc.readByQuery({
            filter: nftFilter(null, q),
            fields: NFT_FIELDS,
            limit,
            sort: ["id"],
          }),
          colSvc.readByQuery({
            filter: {
              _and: [
                { status: { _eq: "published" } },
                {
                  _or: [{ name: { _icontains: q } }, { title: { _icontains: q } }],
                },
              ],
            },
            fields: COLLECTION_FIELDS,
            limit,
          }),
          decc0s.list({ page: 1, limit, search: q }).catch(() => null),
        ]);

        res.json({
          data: {
            artworks: (artworks as NftRow[]).map(normalizeArtwork),
            collections: collections.map(collectionView),
            decc0s: decc0sResult?.status === 200 ? decc0sResult.data : [],
          },
          meta: { query: q, limit },
        });
      } catch (e: any) {
        errorJson(res, 500, e?.message || "Internal error", "INTERNAL");
      }
    });

    // ---- The Library (Cortex RAG) ------------------------------------------
    const libraryUnconfigured = (res: any) =>
      errorJson(res, 503, "The Library is not configured on this deployment.", "UNCONFIGURED");

    router.post("/library/ask", async (req, res) => {
      if (!cortex.configured) return libraryUnconfigured(res);
      const question = String(req.body?.question || "").trim();
      if (!question) return errorJson(res, 400, "Missing 'question'", "BAD_REQUEST");
      try {
        const { status, body } = await cortex.ask(req.body);
        if (status !== 200 || !body) {
          return errorJson(res, 502, `Library upstream error (${status})`, "UPSTREAM");
        }
        res.json({ data: body });
      } catch (e: any) {
        errorJson(res, 502, e?.message || "Library unavailable", "UPSTREAM");
      }
    });

    router.post("/library/ask/stream", async (req, res) => {
      if (!cortex.configured) return libraryUnconfigured(res);
      const question = String(req.body?.question || "").trim();
      if (!question) return errorJson(res, 400, "Missing 'question'", "BAD_REQUEST");
      try {
        const upstream = await cortex.askStream(req.body);
        if (!upstream.ok || !upstream.body) {
          return errorJson(res, 502, `Library upstream error (${upstream.status})`, "UPSTREAM");
        }
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        const stream = Readable.fromWeb(upstream.body as never);
        stream.pipe(res);
        req.on("close", () => stream.destroy());
      } catch (e: any) {
        if (!res.headersSent) {
          errorJson(res, 502, e?.message || "Library unavailable", "UPSTREAM");
        } else {
          res.end();
        }
      }
    });

    router.post("/library/search", async (req, res) => {
      if (!cortex.configured) return libraryUnconfigured(res);
      const query = String(req.body?.query || "").trim();
      if (!query) return errorJson(res, 400, "Missing 'query'", "BAD_REQUEST");
      try {
        const { status, body } = await cortex.search(req.body);
        if (status !== 200 || !body) {
          return errorJson(res, 502, `Library upstream error (${status})`, "UPSTREAM");
        }
        res.json({ data: body });
      } catch (e: any) {
        errorJson(res, 502, e?.message || "Library unavailable", "UPSTREAM");
      }
    });

    router.get("/library/collections", async (_req, res) => {
      if (!cortex.configured) return libraryUnconfigured(res);
      try {
        const { status, body } = await cortex.collections();
        if (status !== 200 || !body) {
          return errorJson(res, 502, `Library upstream error (${status})`, "UPSTREAM");
        }
        res.json({ data: body.collections ?? body, meta: { total: body.total ?? undefined } });
      } catch (e: any) {
        errorJson(res, 502, e?.message || "Library unavailable", "UPSTREAM");
      }
    });

    // ---- Souls (Soulweaver — agent identity for web3) ----------------------
    const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

    const soulsUnconfigured = (res: any) =>
      errorJson(res, 503, "Souls are not configured on this deployment.", "UNCONFIGURED");

    function soulParams(req: any, res: any): { chainId: number; address: string } | null {
      const chainId = Number.parseInt(req.params.chainId, 10);
      const address = String(req.params.contractAddress || "");
      if (Number.isNaN(chainId) || chainId <= 0) {
        errorJson(res, 400, "Invalid chainId", "BAD_REQUEST");
        return null;
      }
      if (!ADDRESS_RE.test(address)) {
        errorJson(res, 400, "Invalid contract address", "BAD_REQUEST");
        return null;
      }
      return { chainId, address };
    }

    function relaySoulResponse(res: any, status: number, body: any) {
      if (status === 200 && body) return res.json({ data: body });
      if (status === 404) return errorJson(res, 404, "No souls found", "NOT_FOUND");
      return errorJson(res, 502, `Souls upstream error (${status})`, "UPSTREAM");
    }

    router.get("/souls/:chainId/:contractAddress", async (req, res) => {
      if (!souls.configured) return soulsUnconfigured(res);
      const p = soulParams(req, res);
      if (!p) return;
      try {
        const page = intParam(req.query.page, 1, 1, 10_000);
        const limit = intParam(req.query.limit, 50, 1, MAX_LIMIT);
        const { status, body } = await souls.list(p.chainId, p.address, page, limit);
        relaySoulResponse(res, status, body);
      } catch (e: any) {
        errorJson(res, 502, e?.message || "Souls unavailable", "UPSTREAM");
      }
    });

    router.get("/souls/:chainId/:contractAddress/:tokenId", async (req, res) => {
      if (!souls.configured) return soulsUnconfigured(res);
      const p = soulParams(req, res);
      if (!p) return;
      try {
        const { status, body } = await souls.one(p.chainId, p.address, String(req.params.tokenId));
        relaySoulResponse(res, status, body);
      } catch (e: any) {
        errorJson(res, 502, e?.message || "Souls unavailable", "UPSTREAM");
      }
    });

    // ---- 404 inside /v1 ----------------------------------------------------
    router.use((_req, res) => {
      errorJson(res, 404, "Unknown /v1 route. See GET /v1 for the endpoint index.", "NOT_FOUND");
    });
  },
});
