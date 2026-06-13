// MOCA "Multipass" importer — read a wallet's curations from the LEGACY app
// (app.museumofcryptoart.com/member/<address>) and map each curated work into
// the same NftView the world builder hangs, so a curator can pull a past
// curation straight onto room walls.
//
// The legacy data lives on the old Strapi v3 backend at api.museumofcryptoart.com
// (public, no auth). A member exposes two kinds of curation:
//   • repertoires  — the curated collections (e.g. the "cryptoart" tab =
//                     "Community Collection")
//   • exhibitions  — curated shows
// Each carries an ordered `order[]` of legacy item ids. `/items?id_in=…` then
// resolves those ids to media we can render.

import { type MediaInfo, type NftView, mediaRatio } from "./media";

export const LEGACY_API = "https://api.museumofcryptoart.com";

/**
 * Legacy item ids share a numeric space with Directus NFT ids. The builder
 * dedups auto-fill by `NftView.id`, so offset Multipass ids to guarantee a
 * Multipass work and a museum work never collide in the same room.
 */
export const MULTIPASS_ID_OFFSET = 1_000_000_000;

export function isEthAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}

export interface MultipassTab {
  kind: "repertoire" | "exhibition";
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  /** Ordered legacy item ids that make up this curation. */
  ids: number[];
}

export interface MultipassMember {
  address: string;
  nickname?: string | null;
  biography?: string | null;
  avatarUrl?: string | null;
}

export interface MultipassProfile {
  member: MultipassMember;
  tabs: MultipassTab[];
}

/* --- legacy shapes (only the fields we read) -------------------------------- */

interface LegacyCuration {
  id: number;
  name?: string | null;
  description?: string | null;
  slug?: string | null;
  order?: number[] | null;
}

interface LegacyUser {
  nickname?: string | null;
  biography?: string | null;
  avatar?: { data?: { image_preview_url?: string; image_url?: string } | null } | null;
  repertoires?: LegacyCuration[] | null;
  exhibitions?: LegacyCuration[] | null;
}

interface LegacyItem {
  id: number;
  name?: string | null;
  type?: string | null; // "Image" | "Video" | …
  mime_type?: string | null;
  media?: string | null;
  media_image?: string | null;
  media_info?: { type?: string; url?: string } | null;
  image?: { url?: string | null; width?: string | number | null; height?: string | number | null } | null;
  video?: { url?: string | null } | null;
  metadata?: { createdBy?: string | null } | null;
}

function toTab(kind: MultipassTab["kind"], c: LegacyCuration): MultipassTab {
  return {
    kind,
    id: c.id,
    slug: c.slug || String(c.id),
    name: c.name || "Untitled",
    description: c.description ?? null,
    ids: Array.isArray(c.order) ? c.order.filter((n) => Number.isFinite(n)) : [],
  };
}

/** Fetch a member's curated tabs from the legacy Strapi backend. */
export async function fetchMultipassProfile(address: string): Promise<MultipassProfile | null> {
  const res = await fetch(`${LEGACY_API}/users/${address.toLowerCase()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  // Unknown wallets come back 404 or 204 (empty body) — both mean "no profile".
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) throw new Error(`legacy users ${res.status}`);
  const text = await res.text();
  if (!text.trim()) return null;
  const u = JSON.parse(text) as LegacyUser | null;
  if (!u || typeof u !== "object") return null;

  const tabs = [
    ...(u.repertoires || []).map((c) => toTab("repertoire", c)),
    ...(u.exhibitions || []).map((c) => toTab("exhibition", c)),
  ].filter((t) => t.ids.length > 0);

  const avatar = u.avatar?.data;
  return {
    member: {
      address: address.toLowerCase(),
      nickname: u.nickname ?? null,
      biography: u.biography ?? null,
      avatarUrl: avatar?.image_preview_url || avatar?.image_url || null,
    },
    tabs,
  };
}

function posNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Map one legacy item into the client-safe NftView the builder hangs. */
export function legacyItemToNftView(item: LegacyItem): NftView {
  const isMotion =
    (item.type || "").toLowerCase() === "video" ||
    item.media_info?.type === "video" ||
    (item.mime_type || "").startsWith("video");

  // The playable file lives in `media`/`media_info.url`; for video works that's
  // the clip (often on the dead openseauserdata.com host that the transform-in
  // proxy revives), so don't mistake it for a still.
  const mediaUrl = item.media || item.media_info?.url || undefined;
  const videoUrl = item.video?.url || (isMotion ? mediaUrl : undefined) || undefined;
  const stillUrl =
    item.image?.url || item.media_image || (isMotion ? undefined : mediaUrl) || undefined;

  const width = posNum(item.image?.width);
  const height = posNum(item.image?.height);

  // Legacy image dimensions come from the original file (not a conversion-CDN
  // square), so they're safe to trust for the wall-frame aspect ratio.
  const preview: MediaInfo | null = stillUrl
    ? { type: "image", url: stillUrl, width, height }
    : null;
  const display: MediaInfo | null = videoUrl
    ? { type: "video", url: videoUrl }
    : preview;

  return {
    id: MULTIPASS_ID_OFFSET + item.id,
    name: item.name ?? null,
    artist_name: item.metadata?.createdBy ?? null,
    preview,
    display: display ?? preview,
    isVideo: !!videoUrl,
    ratio: mediaRatio({ url: stillUrl, width, height }),
  };
}

/**
 * Batch-resolve legacy item ids to NftViews, preserving the requested order
 * and dropping any that no longer resolve.
 */
export async function fetchMultipassItems(ids: number[]): Promise<NftView[]> {
  if (ids.length === 0) return [];
  const params = new URLSearchParams();
  for (const id of ids) params.append("id_in", String(id));
  params.set("_limit", String(ids.length));
  const res = await fetch(`${LEGACY_API}/items?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`legacy items ${res.status}`);
  const items = (await res.json()) as LegacyItem[];
  if (!Array.isArray(items)) return [];

  const byId = new Map<number, LegacyItem>(items.map((it) => [it.id, it]));
  return ids
    .map((id) => byId.get(id))
    .filter((it): it is LegacyItem => !!it)
    .map(legacyItemToNftView);
}
