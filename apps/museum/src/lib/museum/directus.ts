import "server-only";
import {
  createDirectus,
  rest,
  readItems,
  aggregate,
} from "@directus/sdk";

// Public, read-only Directus client for published museum content (collections,
// NFTs, rooms). No auth needed — these read policies are public on the CMS.
// Server-only: keeps the CMS URL and all fetching on the server (galleries
// render as Server Components).

export interface Collection {
  id: number;
  name: string;
  title?: string | null;
  description?: string | null;
  essay?: string | null;
  slug: string;
  status?: string;
  sort?: number | null;
  parent_collection?: number | null;
  child_collections?: { id: number; name: string; slug: string }[];
}

export interface Nft {
  id: number;
  name?: string | null;
  artist_name?: string | null;
  collection?: string | null;
  media_info?: unknown;
  display_media_info?: unknown;
  display_animation_info?: unknown;
  response_opensea?: unknown;
}

export interface Room {
  id: number;
  title?: string | null;
  architect?: string | null;
  description?: string | null;
  series?: string | null;
  slots?: number | null;
  image?: string | null;
  model?: string | null;
  token_id?: string | null;
}

interface Schema {
  collections: Collection[];
  nfts: Nft[];
  rooms: Room[];
}

function getDirectusUrl(): string {
  return process.env.DIRECTUS_URL || "https://api.moca.qwellco.de";
}

function client() {
  return createDirectus<Schema>(getDirectusUrl()).with(rest());
}

/** Asset URL for a Directus file id (rooms images/models). */
export function assetUrl(fileId?: string | null): string {
  if (!fileId) return "";
  return `${getDirectusUrl()}/assets/${fileId}`;
}

export const DEFAULT_COLLECTION_SLUG = "the-genesis-collection";
export const NFTS_PER_PAGE = 24;

/** Top-level (parent) published collections — for galleries index + nav. */
export async function listTopCollections(): Promise<Collection[]> {
  const rows = await client().request(
    readItems("collections", {
      fields: [
        "id",
        "name",
        "title",
        "description",
        "slug",
        "sort",
        { child_collections: ["id", "name", "slug"] },
      ],
      filter: {
        _and: [
          { status: { _eq: "published" } },
          { parent_collection: { _null: true } },
        ],
      },
      sort: ["sort", "name"],
      limit: -1,
    })
  );
  return rows as unknown as Collection[];
}

/** A single published collection by slug, with its child collections. */
export async function getCollection(slug: string): Promise<Collection | null> {
  const rows = await client().request(
    readItems("collections", {
      fields: [
        "id",
        "name",
        "title",
        "description",
        "essay",
        "slug",
        { child_collections: ["id", "name", "slug"] },
      ],
      filter: {
        _and: [{ status: { _eq: "published" } }, { slug: { _eq: slug } }],
      },
      limit: 1,
    })
  );
  return ((rows as unknown as Collection[])[0]) ?? null;
}

function nftFilter(slugs: string[], search?: string) {
  const base: Record<string, unknown>[] = [
    { collection_type: { slug: { _in: slugs } } },
    { media_info: { _null: false } },
    { display_media_info: { _null: false } },
  ];
  if (search && search.trim()) {
    base.push({
      _or: [
        { name: { _icontains: search.trim() } },
        { artist_name: { _icontains: search.trim() } },
      ],
    });
  }
  return { _and: base };
}

export async function countNfts(
  slugs: string[],
  search?: string
): Promise<number> {
  const res = await client().request(
    aggregate("nfts", {
      aggregate: { count: "*" },
      query: { filter: nftFilter(slugs, search) as never },
    })
  );
  const count = (res as unknown as { count: number | string }[])[0]?.count;
  return Number(count) || 0;
}

export async function listNfts(opts: {
  slugs: string[];
  page?: number;
  search?: string;
  limit?: number;
}): Promise<Nft[]> {
  const limit = opts.limit ?? NFTS_PER_PAGE;
  const page = Math.max(1, opts.page ?? 1);
  const rows = await client().request(
    readItems("nfts", {
      fields: [
        "id",
        "name",
        "artist_name",
        "collection",
        "media_info",
        "display_media_info",
        "display_animation_info",
        "response_opensea",
      ],
      filter: nftFilter(opts.slugs, opts.search) as never,
      limit,
      offset: (page - 1) * limit,
    })
  );
  return rows as unknown as Nft[];
}

/** A batch of candidate pieces (with media) for a collection cover/shuffle. */
export async function listCollectionPreviews(
  slugs: string[],
  count = 12
): Promise<Nft[]> {
  try {
    return await listNfts({ slugs, limit: count });
  } catch {
    return [];
  }
}

/** Published rooms (immersive exhibitions). */
export async function listRooms(): Promise<Room[]> {
  const rows = await client().request(
    readItems("rooms", {
      fields: [
        "id",
        "title",
        "architect",
        "description",
        "series",
        "slots",
        "image",
        "model",
        "token_id",
      ],
      sort: ["series", "title"],
      limit: -1,
    })
  );
  return rows as unknown as Room[];
}
