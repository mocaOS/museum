"use client";

import { useEffect, useMemo, useState } from "react";
import type { NftView } from "@/lib/museum/media";
import { ArtworkGrid } from "./ArtworkPicker";

interface MultipassTab {
  kind: "repertoire" | "exhibition";
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  ids: number[];
}

interface MultipassMember {
  address: string;
  nickname?: string | null;
  biography?: string | null;
  avatarUrl?: string | null;
}

interface MultipassProfile {
  member: MultipassMember;
  tabs: MultipassTab[];
}

const PER_PAGE = 24;
const tabKey = (t: MultipassTab) => `${t.kind}:${t.slug}`;

/**
 * Multipass importer for the builder's curate panel. Drop a wallet address,
 * pull the curations that wallet built in the legacy MOCA app, then browse each
 * one (repertoires + exhibitions become tabs) and click a work to hang it on
 * the active wall slot — same `onPick` contract as the museum-collection
 * browser. Data comes from /api/museum/multipass*.
 */
export default function MultipassImporter({
  canPick,
  onPick,
}: {
  canPick: boolean;
  onPick: (art: NftView) => void;
}) {
  const [ address, setAddress ] = useState("");
  const [ profile, setProfile ] = useState<MultipassProfile | null>(null);
  const [ loadingProfile, setLoadingProfile ] = useState(false);
  const [ error, setError ] = useState<string | null>(null);

  const [ activeKey, setActiveKey ] = useState<string | null>(null);
  const [ page, setPage ] = useState(1);
  const [ arts, setArts ] = useState<NftView[]>([]);
  const [ loadingArts, setLoadingArts ] = useState(false);

  const activeTab = useMemo(
    () => profile?.tabs.find((t) => tabKey(t) === activeKey) ?? null,
    [ profile, activeKey ],
  );

  async function loadProfile() {
    const addr = address.trim();
    if (!addr) return;
    setLoadingProfile(true);
    setError(null);
    setProfile(null);
    setArts([]);
    setActiveKey(null);
    try {
      const r = await fetch(`/api/museum/multipass?address=${encodeURIComponent(addr)}`);
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Could not load this Multipass.");
        return;
      }
      const prof = d as MultipassProfile;
      setProfile(prof);
      if (prof.tabs.length === 0) {
        setError("This wallet has no curated repertoires or exhibitions.");
      } else {
        setActiveKey(tabKey(prof.tabs[0]));
      }
    } catch {
      setError("Could not reach the Multipass service.");
    } finally {
      setLoadingProfile(false);
    }
  }

  // Reset to page 1 whenever the active tab changes.
  useEffect(() => {
    setPage(1);
  }, [ activeKey ]);

  // Fetch the active page of the active tab's works.
  useEffect(() => {
    if (!activeTab) {
      setArts([]);
      return;
    }
    const pageIds = activeTab.ids.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    if (pageIds.length === 0) {
      setArts([]);
      return;
    }
    const ctrl = new AbortController();
    setLoadingArts(true);
    fetch(`/api/museum/multipass/items?ids=${pageIds.join(",")}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { artworks: NftView[] }) => setArts(d.artworks || []))
      .catch((e) => {
        if (e.name !== "AbortError") setArts([]);
      })
      .finally(() => setLoadingArts(false));
    return () => ctrl.abort();
  }, [ activeTab, page ]);

  const total = activeTab?.ids.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const repertoires = profile?.tabs.filter((t) => t.kind === "repertoire") ?? [];
  const exhibitions = profile?.tabs.filter((t) => t.kind === "exhibition") ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Address bar */}
      <div className="space-y-2 border-b px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            loadProfile();
          }}
        >
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Wallet address (0x…)"
            spellCheck={false}
            autoCapitalize="off"
            className={`
              h-9 min-w-0 flex-1 rounded-[var(--radius)] border bg-transparent
              px-2.5 text-sm outline-none
            `}
            style={{ borderColor: "var(--border)", color: "var(--fg1)", fontFamily: "var(--font-mono)" }}
          />
          <button
            type="submit"
            disabled={loadingProfile || !address.trim()}
            className={`
              shrink-0 rounded-[var(--radius)] px-3 text-[11px] transition-transform
              active:scale-[0.98]
              disabled:opacity-40
            `}
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {loadingProfile ? "Loading…" : "Import"}
          </button>
        </form>

        {/* Member + tab picker, once loaded */}
        {profile && profile.tabs.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              {profile.member.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.member.avatarUrl}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded-full object-cover"
                  style={{ background: "var(--muted)" }}
                />
              )}
              <span className="truncate text-[11px]" style={{ color: "var(--fg2)" }}>
                {profile.member.nickname || profile.member.address}
              </span>
            </div>
            <select
              value={activeKey ?? ""}
              onChange={(e) => setActiveKey(e.target.value)}
              className={`
                h-9 w-full rounded-[var(--radius)] border bg-transparent px-2
                text-sm outline-none
              `}
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            >
              {repertoires.length > 0 && (
                <optgroup label="Repertoires">
                  {repertoires.map((t) => (
                    <option key={tabKey(t)} value={tabKey(t)} style={{ background: "var(--card)" }}>
                      {t.name} ({t.ids.length})
                    </option>
                  ))}
                </optgroup>
              )}
              {exhibitions.length > 0 && (
                <optgroup label="Exhibitions">
                  {exhibitions.map((t) => (
                    <option key={tabKey(t)} value={tabKey(t)} style={{ background: "var(--card)" }}>
                      {t.name} ({t.ids.length})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--fg3)" }}>
              <span style={{ fontFamily: "var(--font-mono)" }}>{total} works</span>
              {loadingArts && <span>loading…</span>}
            </div>
          </>
        )}

        {error && (
          <div className="text-[11px]" style={{ color: "var(--fg3)" }}>
            {error}
          </div>
        )}
        {!profile && !error && !loadingProfile && (
          <div className="text-[11px]" style={{ color: "var(--fg3)" }}>
            Pull a wallet&apos;s past MOCA curations and hang them here.
          </div>
        )}
      </div>

      {/* Results grid */}
      {profile && activeTab && (
        <ArtworkGrid
          artworks={arts}
          canPick={canPick}
          onPick={onPick}
          loading={loadingArts}
          emptyLabel="No works resolved for this tab."
        />
      )}

      {/* Pager */}
      {profile && totalPages > 1 && (
        <div className={`
          flex items-center justify-between border-t px-3 py-2.5 text-xs
        `} style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className={`
              rounded-full px-3 py-1 transition-colors
              disabled:opacity-30
            `}
            style={{ color: "var(--fg1)", background: "var(--muted)" }}
          >
            Prev
          </button>
          <span style={{ color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className={`
              rounded-full px-3 py-1 transition-colors
              disabled:opacity-30
            `}
            style={{ color: "var(--fg1)", background: "var(--muted)" }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
