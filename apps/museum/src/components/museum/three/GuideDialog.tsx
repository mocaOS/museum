"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { HyperfyExhibition } from "./hyperfy-export";
import { buildGuideHyp, downloadGuideHyp } from "@/lib/museum/hyperfy/guide-hyp";
import { type GuideOptions, spawnGuide } from "@/lib/museum/hyperfy/spawn";

/**
 * "Museum guide" — launch the agentic VRM guide into a Hyperfy world, the
 * same way rooms are launched. Pick who the guide IS first:
 *
 * - an **Art DeCC0** (searchable, straight from the public Codex at
 *   api.decc0s.com — CORS-open),
 * - a **Soulweaver soul** by chain/contract/token coordinate (resolved
 *   server-side by the MOCA API at answer time), or
 * - an **uploaded SOUL.md** of your own (baked into the guide app).
 *
 * Then send it into the exhibition's world (idempotent — re-sending swaps
 * the persona in place, keeping where admins put the avatar) or download it
 * as a drag-droppable `.hyp` app. The world URL + admin key are shared with
 * the Spawn dialog (same localStorage target).
 */

const TARGET_KEY = "moca-hyperfy-target-v1";
const GUIDE_KEY = "moca-guide-config-v1";
const DECC0S_API = "https://api.decc0s.com";

type PersonaSource = "decc0" | "soulweaver" | "soul";

interface GuideAvatar {
  id: string;
  name: string;
  url: string;
}

const DEFAULT_AVATAR: GuideAvatar = {
  id: "oblak-2875",
  name: "Oblak",
  url: "/avatars/decc0.vrm",
};

interface Decc0Hit {
  id: number;
  name: string;
  thumb: string | null;
}

interface GuideConfig {
  source: PersonaSource;
  decc0: string;
  decc0Name: string;
  swChain: string;
  swContract: string;
  swToken: string;
  soulName: string;
  guideName: string;
  avatarId: string;
  /** MOCA API override — empty = the public api.moca.qwellco.de. */
  apiUrl: string;
}

const DEFAULT_CONFIG: GuideConfig = {
  source: "decc0",
  decc0: "2875",
  decc0Name: "Oblak",
  swChain: "1",
  swContract: "",
  swToken: "",
  soulName: "",
  guideName: "Oblak",
  avatarId: DEFAULT_AVATAR.id,
  apiUrl: "",
};

function loadConfig(): GuideConfig {
  try {
    const raw = window.localStorage.getItem(GUIDE_KEY);
    if (raw) {
      const merged = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<GuideConfig>) };
      // Migrate the previous default persona (4209 Tsahafi) to the new one.
      if (merged.decc0 === "4209") {
        merged.decc0 = "2875";
        merged.decc0Name = "Oblak";
      }
      if (merged.guideName === "Tsahafi") merged.guideName = "Oblak";
      return merged;
    }
  } catch {
    /* noop */
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: GuideConfig) {
  try {
    window.localStorage.setItem(GUIDE_KEY, JSON.stringify(config));
  } catch {
    /* noop */
  }
}

/** World target shared with SpawnHyperfyDialog — read url/key, keep the rest. */
function loadTarget(): { url: string; key: string } {
  try {
    const raw = window.localStorage.getItem(TARGET_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { url?: string; key?: string };
      return { url: p.url || "", key: p.key || "" };
    }
  } catch {
    /* noop */
  }
  return { url: "", key: "" };
}

function saveTarget(url: string, key: string) {
  try {
    const raw = window.localStorage.getItem(TARGET_KEY);
    const p = raw ? JSON.parse(raw) : {};
    window.localStorage.setItem(TARGET_KEY, JSON.stringify({ ...p, url, key }));
  } catch {
    /* noop */
  }
}

/** Latest version key of an additively-versioned map ("v0.1", "v0.2", …). */
function latestVersion(map: Record<string, unknown>): string | null {
  const keys = Object.keys(map).filter(k => map[k] && typeof map[k] === "object");
  if (!keys.length) return null;
  return keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[keys.length - 1];
}

/** Name from a SOUL.md heading ("# SOUL.md — Name" / "# Name"), else null. */
function soulHeadingName(text: string): string | null {
  const m = text.match(/^#\s*(?:SOUL\.md\s*[—-]\s*)?(.+)$/m);
  return m ? m[1].trim().slice(0, 60) : null;
}

function Icon({ size = 15, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function IconClose({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>;
}
function IconBot({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
  </Icon>;
}
function IconCheck({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>;
}
function IconAlert({ size }: { size?: number }) {
  return <Icon size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </Icon>;
}
function IconDownload({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </Icon>;
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px]"
      style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
      aria-hidden
    />
  );
}

export default function GuideDialog({
  open,
  onClose,
  buildExhibition,
}: {
  open: boolean;
  onClose: () => void;
  buildExhibition: () => HyperfyExhibition;
}) {
  const [ url, setUrl ] = useState("");
  const [ key, setKey ] = useState("");
  const [ config, setConfig ] = useState<GuideConfig>(DEFAULT_CONFIG);
  const [ avatars, setAvatars ] = useState<GuideAvatar[]>([ DEFAULT_AVATAR ]);
  const [ soulText, setSoulText ] = useState("");

  // DeCC0 search (public Codex, CORS-open)
  const [ query, setQuery ] = useState("");
  const [ hits, setHits ] = useState<Decc0Hit[]>([]);
  const [ searching, setSearching ] = useState(false);

  // The selected persona, made visible: identity card + readable SOUL.md.
  const [ persona, setPersona ] = useState<{ id: number; name: string; thumb: string | null } | null>(null);
  const [ soulDoc, setSoulDoc ] = useState<string | null>(null);
  const [ soulOpen, setSoulOpen ] = useState(false);
  const [ soulLoading, setSoulLoading ] = useState(false);

  const [ busy, setBusy ] = useState<"send" | "hyp" | null>(null);
  const [ msg, setMsg ] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (patch: Partial<GuideConfig>) => setConfig(c => ({ ...c, ...patch }));

  useEffect(() => {
    if (!open) return;
    const t = loadTarget();
    setUrl(t.url);
    setKey(t.key);
    setConfig(loadConfig());
    setMsg(null);
    setBusy(null);
    fetch("/avatars/avatars.json")
      .then(r => (r.ok ? r.json() : null))
      .then((j) => {
        if (Array.isArray(j?.avatars) && j.avatars.length) setAvatars(j.avatars);
      })
      .catch(() => {
        /* the bundled default still works */
      });
  }, [ open ]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ open, busy, onClose ]);

  // Resolve the selected DeCC0's identity (name + portrait) so the curator
  // always SEES who the guide will be.
  useEffect(() => {
    if (!open || config.source !== "decc0") return;
    const id = Number.parseInt(config.decc0, 10);
    setSoulDoc(null);
    setSoulOpen(false);
    if (!id || id < 1 || id > 10000) {
      setPersona(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${DECC0S_API}/items/codex/${id}?fields=id,name,thumbnail_character`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error(String(res.status));
        const { data } = await res.json();
        setPersona({
          id,
          name: (Array.isArray(data.name) ? data.name[0] : data.name) || `#${id}`,
          thumb: data.thumbnail_character
            ? `${DECC0S_API}/assets/${data.thumbnail_character}?key=s128`
            : null,
        });
      } catch {
        setPersona(null);
      }
    }, 300);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [ open, config.source, config.decc0 ]);

  const loadSoul = async () => {
    if (soulOpen) {
      setSoulOpen(false);
      return;
    }
    setSoulOpen(true);
    if (soulDoc || soulLoading) return;
    const id = Number.parseInt(config.decc0, 10);
    if (!id) return;
    setSoulLoading(true);
    try {
      const res = await fetch(`${DECC0S_API}/items/codex/${id}?fields=moltbot`);
      const { data } = await res.json();
      const ver = data?.moltbot ? latestVersion(data.moltbot) : null;
      const v = ver ? data.moltbot[ver] : null;
      const text = [ v?.identity, v?.soul ].filter(Boolean).join("\n\n");
      setSoulDoc(text || "No SOUL.md found for this DeCC0.");
    } catch {
      setSoulDoc("Could not load the SOUL — the Codex may be unreachable.");
    } finally {
      setSoulLoading(false);
    }
  };

  // Debounced DeCC0 search against the public Codex.
  useEffect(() => {
    if (!open || config.source !== "decc0") return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          fields: "id,name,thumbnail_character",
          limit: "6",
          search: q,
        });
        const res = await fetch(`${DECC0S_API}/items/codex?${params}`);
        if (!res.ok) throw new Error(String(res.status));
        const { data } = await res.json();
        setHits(
          (data || []).map((d: any) => ({
            id: d.id,
            name: (Array.isArray(d.name) ? d.name[0] : d.name) || `#${d.id}`,
            thumb: d.thumbnail_character
              ? `${DECC0S_API}/assets/${d.thumbnail_character}?key=s128`
              : null,
          })),
        );
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [ open, config.source, query ]);

  if (!open) return null;

  const normalizedUrl = url.trim().replace(/\/+$/, "");
  const urlOk = /^https?:\/\/.+/.test(normalizedUrl);

  const personaReady
    = config.source === "decc0"
      ? !!Number.parseInt(config.decc0, 10)
      : config.source === "soulweaver"
        ? /^0x[0-9a-fA-F]{40}$/.test(config.swContract.trim()) && !!config.swToken.trim()
        : !!soulText.trim();

  const guideOptions = (): GuideOptions => {
    const avatar = avatars.find(a => a.id === config.avatarId) || avatars[0] || DEFAULT_AVATAR;
    const base: GuideOptions = {
      name: config.guideName.trim() || "Oblak",
      avatarUrl: avatar.url,
      apiUrl: config.apiUrl.trim() || undefined,
    };
    if (config.source === "soul" && soulText.trim()) {
      return {
        ...base,
        customSoul: soulText.trim().slice(0, 4000),
        soulName: config.soulName.trim() || undefined,
      };
    }
    if (config.source === "soulweaver") {
      return {
        ...base,
        soulRef: {
          chainId: Number.parseInt(config.swChain, 10) || 1,
          address: config.swContract.trim(),
          tokenId: config.swToken.trim(),
        },
      };
    }
    return { ...base, decc0Id: Number.parseInt(config.decc0, 10) || 2875 };
  };

  const send = async () => {
    if (!urlOk || !personaReady || busy) return;
    saveTarget(normalizedUrl, key);
    saveConfig(config);
    setBusy("send");
    setMsg(null);
    try {
      const result = await spawnGuide(buildExhibition(), {
        url: normalizedUrl,
        key: key.trim() || undefined,
        guide: guideOptions(),
      });
      setMsg(
        result.verified
          ? {
              ok: true,
              text: result.status === "unchanged"
                ? "The guide is already up to date in the world."
                : `Guide ${result.status} and verified — walk in and hold E to talk.`,
            }
          : { ok: false, text: "The guide did not appear in the world — wrong admin key?" },
      );
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const downloadHyp = async () => {
    if (!personaReady || busy) return;
    saveConfig(config);
    setBusy("hyp");
    setMsg(null);
    try {
      const { blob, filename, registration } = await buildGuideHyp(buildExhibition(), guideOptions());
      downloadGuideHyp(blob, filename);
      setMsg({
        ok: true,
        text: registration.registered
          ? "Saved — drop the file into any world (build mode)."
          : "Saved — context registration failed; the guide runs on baked knowledge.",
      });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const sourceChip = (source: PersonaSource, label: string) => (
    <button
      onClick={() => set({ source })}
      className="h-7 rounded-full px-3 text-[11px] transition-colors"
      style={config.source === source
        ? { background: "var(--accent)", color: "var(--accent-fg)" }
        : { background: "var(--muted)", color: "var(--fg2)" }}
    >
      {label}
    </button>
  );

  const inputStyle = { borderColor: "var(--border)", color: "var(--fg1)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(0 0 0 / 0.60)", backdropFilter: "blur(6px)" }}
      onClick={() => !busy && onClose()}
    >
      <div
        className={`
          flex w-full max-w-md flex-col rounded-[var(--radius-xl)] border
        `}
        style={{
          maxHeight: "calc(85dvh / var(--ui-scale, 1))",
          background: "var(--popover)",
          borderColor: "var(--border)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5" style={{ color: "var(--accent)" }}>
              <IconBot size={20} />
            </span>
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--fg1)" }}>
                Exhibit curator
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed" style={{ color: "var(--fg3)" }}>
                Send an AI curator into your exhibition — it knows the rooms,
                architects, artists and works, and answers visitors in
                character.
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={!!busy}
            className={`
              -m-1 rounded-full p-1 transition-colors
              disabled:opacity-30
            `}
            style={{ color: "var(--fg3)" }}
            title="Close"
          >
            <IconClose size={16} />
          </button>
        </div>

        {/* Body */}
        <div className={`
          flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4
        `}>
          {/* Persona source */}
          <div>
            <span
              className="mb-1.5 block text-[10.5px] tracking-[0.08em] uppercase"
              style={{ color: "var(--fg3)" }}
            >
              Persona
            </span>
            <div className="flex gap-1.5">
              {sourceChip("decc0", "Art DeCC0")}
              {sourceChip("soulweaver", "Soulweaver")}
              {sourceChip("soul", "Upload SOUL")}
            </div>
          </div>

          {config.source === "decc0" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search the 10,000 DeCC0s…"
                  className={`
                    h-8 flex-1 rounded-[var(--radius)] border bg-transparent
                    px-3 text-[12.5px] outline-none
                  `}
                  style={inputStyle}
                />
                <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--fg2)" }}>
                  #
                  <input
                    value={config.decc0}
                    onChange={e => set({ decc0: e.target.value.replace(/[^\d]/g, ""), decc0Name: "" })}
                    inputMode="numeric"
                    className={`
                      h-8 w-16 rounded-[var(--radius)] border bg-transparent
                      px-2 font-mono text-[12px] outline-none
                    `}
                    style={inputStyle}
                  />
                </label>
              </div>
              {searching && (
                <span className="flex items-center gap-2 text-[11px]" style={{ color: "var(--fg3)" }}>
                  <Spinner /> Searching the Codex…
                </span>
              )}
              {hits.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {hits.map(h => (
                    <button
                      key={h.id}
                      onClick={() => {
                        set({ decc0: String(h.id), decc0Name: h.name, guideName: h.name });
                        setQuery("");
                        setHits([]);
                      }}
                      className={`
                        flex items-center gap-2 rounded-[var(--radius)] border
                        p-1.5 text-left transition-colors
                      `}
                      style={{ borderColor: "var(--border)", background: "var(--card)" }}
                      title={`DeCC0 #${h.id}`}
                    >
                      {h.thumb && (
                        <img
                          src={h.thumb}
                          alt=""
                          className={`
                            h-8 w-8 shrink-0 rounded-[var(--radius-sm)]
                            object-cover
                          `}
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-[11px]" style={{ color: "var(--fg1)" }}>
                          {h.name}
                        </span>
                        <span className="block font-mono text-[9.5px]" style={{ color: "var(--fg3)" }}>
                          #{h.id}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {persona
                ? (
                    <div
                      className={`
                        flex items-center gap-2.5 rounded-[var(--radius)] border
                        px-2.5 py-2
                      `}
                      style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                      {persona.thumb && (
                        <img
                          src={persona.thumb}
                          alt=""
                          className={`
                            h-10 w-10 shrink-0 rounded-[var(--radius-sm)]
                            object-cover
                          `}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px]" style={{ color: "var(--fg1)" }}>
                          {persona.name}
                        </div>
                        <div className="font-mono text-[10px]" style={{ color: "var(--fg3)" }}>
                          DeCC0 #{persona.id} · soul from the MOCA Codex
                        </div>
                      </div>
                      <button
                        onClick={loadSoul}
                        className={`
                          shrink-0 rounded-full px-2.5 py-1 text-[10.5px]
                          transition-colors
                        `}
                        style={{ background: "var(--muted)", color: "var(--fg1)" }}
                      >
                        {soulOpen ? "Hide SOUL" : "Read SOUL.md"}
                      </button>
                    </div>
                  )
                : (
                    <span className="text-[10.5px]" style={{ color: "var(--fg3)" }}>
                      DeCC0 #{config.decc0 || "—"} — default 2875 is Oblak, the cryptoart guide.
                    </span>
                  )}
              {soulOpen && (
                <pre
                  className={`
                    max-h-44 overflow-y-auto rounded-[var(--radius)] border
                    p-2.5 font-mono text-[10px] leading-relaxed
                    whitespace-pre-wrap
                  `}
                  style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--fg2)" }}
                >
                  {soulLoading ? "Reading the Codex…" : soulDoc}
                </pre>
              )}
            </div>
          )}

          {config.source === "soulweaver" && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--fg2)" }}>
                  Chain
                  <input
                    value={config.swChain}
                    onChange={e => set({ swChain: e.target.value.replace(/[^\d]/g, "") })}
                    inputMode="numeric"
                    className={`
                      h-8 w-14 rounded-[var(--radius)] border bg-transparent
                      px-2 font-mono text-[12px] outline-none
                    `}
                    style={inputStyle}
                  />
                </label>
                <label className="flex flex-1 items-center gap-1.5 text-[11px]" style={{ color: "var(--fg2)" }}>
                  Contract
                  <input
                    value={config.swContract}
                    onChange={e => set({ swContract: e.target.value.trim() })}
                    placeholder="0x…"
                    className={`
                      h-8 min-w-0 flex-1 rounded-[var(--radius)] border
                      bg-transparent px-2 font-mono text-[11px] outline-none
                    `}
                    style={inputStyle}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--fg2)" }}>
                  Token
                  <input
                    value={config.swToken}
                    onChange={e => set({ swToken: e.target.value.trim() })}
                    className={`
                      h-8 w-20 rounded-[var(--radius)] border bg-transparent
                      px-2 font-mono text-[12px] outline-none
                    `}
                    style={inputStyle}
                  />
                </label>
              </div>
              <span className="text-[10.5px] leading-relaxed" style={{ color: "var(--fg3)" }}>
                The token&apos;s EIP-191-signed SOUL is fetched from Soulweaver by
                the museum backend when the guide answers — nothing to upload.
              </span>
            </div>
          )}

          {config.source === "soul" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <label
                  className={`
                    flex h-8 cursor-pointer items-center gap-2
                    rounded-[var(--radius)] border px-3 text-[11.5px]
                    transition-colors
                  `}
                  style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
                >
                  <IconDownload size={13} />
                  {soulText ? "Replace SOUL.md" : "Choose SOUL.md"}
                  <input
                    type="file"
                    accept=".md,.txt,text/markdown,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      file.text().then((text) => {
                        setSoulText(text);
                        const name = soulHeadingName(text) || file.name.replace(/\.(md|txt)$/i, "");
                        set({ soulName: name, guideName: name });
                      });
                    }}
                  />
                </label>
                <input
                  value={config.soulName}
                  onChange={e => set({ soulName: e.target.value })}
                  placeholder="Soul name"
                  className={`
                    h-8 min-w-0 flex-1 rounded-[var(--radius)] border
                    bg-transparent px-2 text-[12px] outline-none
                  `}
                  style={inputStyle}
                />
              </div>
              <span className="text-[10.5px] leading-relaxed" style={{ color: "var(--fg3)" }}>
                {soulText
                  ? `${soulText.trim().length.toLocaleString()} characters loaded — baked into the guide app (editable later in its inspector).`
                  : "Bring any agent's SOUL.md — e.g. downloaded from Soulweaver — and the guide embodies it."}
              </span>
            </div>
          )}

          {/* Body & name */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--fg2)" }}>
              Name
              <input
                value={config.guideName}
                onChange={e => set({ guideName: e.target.value })}
                className={`
                  h-8 w-32 rounded-[var(--radius)] border bg-transparent px-2
                  text-[12px] outline-none
                `}
                style={inputStyle}
              />
            </label>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--fg2)" }}>
              Avatar
              <select
                value={config.avatarId}
                onChange={e => set({ avatarId: e.target.value })}
                className={`
                  h-8 rounded-[var(--radius)] border bg-transparent px-2
                  text-[12px] outline-none
                `}
                style={{ ...inputStyle, background: "var(--popover)" }}
              >
                {avatars.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          </div>

          {/* World target */}
          <div>
            <span
              className="mb-1.5 block text-[10.5px] tracking-[0.08em] uppercase"
              style={{ color: "var(--fg3)" }}
            >
              World
            </span>
            <div className="flex flex-col gap-2">
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://your-world.example.com"
                className={`
                  h-8 w-full rounded-[var(--radius)] border bg-transparent px-3
                  font-mono text-[12.5px] outline-none
                `}
                style={inputStyle}
              />
              <input
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="admin key (ADMIN_CODE)"
                type="password"
                autoComplete="off"
                className={`
                  h-8 w-full rounded-[var(--radius)] border bg-transparent px-3
                  font-mono text-[12.5px] outline-none
                `}
                style={inputStyle}
              />
              <input
                value={config.apiUrl}
                onChange={e => set({ apiUrl: e.target.value })}
                placeholder="Museum API (default api.moca.qwellco.de)"
                className={`
                  h-8 w-full rounded-[var(--radius)] border bg-transparent px-3
                  font-mono text-[12.5px] outline-none
                `}
                style={inputStyle}
                title="Where the guide asks for answers — override for a local or self-hosted MOCA API"
              />
            </div>
            <span className="mt-1.5 block text-[10.5px] leading-relaxed" style={{ color: "var(--fg3)" }}>
              Same target as Spawn to Hyperfy. Sending the guide registers
              this exhibition&apos;s context with the MOCA API — re-send anytime
              to swap the persona; the avatar stays where admins put it.
            </span>
          </div>

          {msg && (
            <div
              className={`
                flex items-start gap-2 rounded-[var(--radius)] border px-3
                py-2.5 text-[12px]
              `}
              style={{
                borderColor: msg.ok ? "var(--border)" : "var(--destructive, oklch(0.55 0.2 25))",
                color: "var(--fg1)",
              }}
            >
              <span
                className="mt-0.5 shrink-0"
                style={{ color: msg.ok ? "var(--accent)" : "var(--destructive, oklch(0.55 0.2 25))" }}
              >
                {msg.ok ? <IconCheck size={14} /> : <IconAlert size={14} />}
              </span>
              {msg.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 border-t px-5 py-3.5"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            onClick={downloadHyp}
            disabled={!personaReady || !!busy}
            className={`
              flex h-9 items-center gap-2 rounded-[var(--radius)] px-3 text-sm
              transition-colors
              disabled:opacity-30
            `}
            style={{ background: "var(--muted)", color: "var(--fg1)" }}
            title="Bundle as a drag-droppable Hyperfy app file — no world URL or key needed"
          >
            {busy === "hyp" ? <Spinner /> : <IconDownload size={14} />}
            .hyp
          </button>
          <button
            onClick={send}
            disabled={!urlOk || !personaReady || !!busy}
            className={`
              flex h-9 items-center gap-2 rounded-[var(--radius)] px-4 text-sm
              transition-transform
              active:scale-[0.98]
              disabled:opacity-30
            `}
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {busy === "send" ? <Spinner /> : <IconBot size={15} />}
            {busy === "send" ? "Sending…" : "Send into exhibition"}
          </button>
        </div>
      </div>
    </div>
  );
}
