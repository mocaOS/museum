"use client";

import Link from "next/link";
import { useState } from "react";
import { posterSrc, type VideoPlatform, type VideoRef } from "@/lib/museum/video";
import VideoPlayerModal from "./VideoPlayerModal";
import VideoEmbedPreconnect from "./VideoEmbedPreconnect";

interface Article {
  title: string;
  publisher: string;
  description?: string;
  url: string;
}

interface Interview {
  url: string;
  platform: VideoPlatform;
  title: string;
}

interface ArtistInterview {
  id: string;
  title: string;
}

interface Podcast {
  show: string;
  title: string;
  url: string;
}

interface Presskit {
  title: string;
  description?: string;
  url: string;
}

export interface PressRoom {
  intro: string;
  featured: Article[];
  publications: Article[];
  interviews: Interview[];
  artistInterviews: ArtistInterview[];
  podcasts: Podcast[];
  presskit: Presskit;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "press", label: "Press" },
  { id: "interviews", label: "Interviews" },
  { id: "podcasts", label: "Podcasts" },
  { id: "presskit", label: "Press Kit" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const Arrow = () => (
  <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>
    →
  </span>
);


const PlayIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7z" />
  </svg>
);

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-5 text-[11px] uppercase tracking-[0.16em]"
      style={{ color: "var(--fg3)" }}
    >
      {children}
    </h2>
  );
}

function ArticleCard({ a, featured }: { a: Article; featured?: boolean }) {
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col justify-between rounded-[var(--radius-lg)] border p-5 transition-transform duration-200 hover:-translate-y-1"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div>
        <span
          className="inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
          style={{ background: "var(--muted)", color: "var(--fg2)" }}
        >
          {a.publisher}
        </span>
        <h3
          className={`mt-3 font-medium leading-snug ${featured ? "text-lg" : "text-base"}`}
          style={{ color: "var(--fg1)" }}
        >
          {a.title}
        </h3>
        {a.description && (
          <p className="mt-2 text-sm" style={{ color: "var(--fg2)" }}>
            {a.description}
          </p>
        )}
      </div>
      <div className="mt-4 flex items-center gap-1 text-xs" style={{ color: "var(--accent)" }}>
        Read <Arrow />
      </div>
    </a>
  );
}

export default function PressRoomBrowser({ data }: { data: PressRoom }) {
  const [active, setActive] = useState<FilterId>("all");
  const [playing, setPlaying] = useState<Interview | null>(null);
  const show = (id: FilterId) => active === "all" || active === id;

  return (
    <>
      <VideoEmbedPreconnect />
      <div className="mb-10 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setActive(f.id)}
            className="rounded-full border px-3.5 py-1.5 text-sm transition-colors"
            style={{
              borderColor: active === f.id ? "var(--accent)" : "var(--border)",
              background: active === f.id ? "var(--accent)" : "transparent",
              color: active === f.id ? "var(--accent-fg)" : "var(--fg2)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-14">
        {/* Press */}
        {show("press") && (
          <section>
            <SectionLabel>Featured coverage</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.featured.map((a) => (
                <ArticleCard key={a.url} a={a} featured />
              ))}
            </div>

            <h3 className="mb-4 mt-10 text-base font-medium" style={{ color: "var(--fg1)" }}>
              In the press
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.publications.map((a) => (
                <ArticleCard key={a.url} a={a} />
              ))}
            </div>
          </section>
        )}

        {/* Interviews */}
        {show("interviews") && (
          <section>
            <SectionLabel>Interviews</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.interviews.map((v) => (
                <button
                  key={v.url}
                  onClick={() => setPlaying(v)}
                  className="group flex items-center gap-3 rounded-[var(--radius)] border p-4 text-left transition-transform duration-200 hover:-translate-y-0.5"
                  style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105"
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    <PlayIcon />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug" style={{ color: "var(--fg1)" }}>
                      {v.title}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--fg3)" }}>
                      {v.platform}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mb-4 mt-10 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-medium" style={{ color: "var(--fg1)" }}>
                Artist Interviews
              </h3>
              <Link
                href="/moca-live"
                className="group flex items-center gap-1 text-xs"
                style={{ color: "var(--accent)" }}
              >
                Explore more on MOCA Live <Arrow />
              </Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.artistInterviews.map((a) => {
                const ref: VideoRef = {
                  url: `https://www.youtube.com/watch?v=${a.id}`,
                  platform: "YouTube",
                  title: a.title,
                };
                return (
                  <button
                    key={a.id}
                    onClick={() => setPlaying(ref)}
                    className="group flex flex-col overflow-hidden rounded-[var(--radius-lg)] border text-left transition-transform duration-200 hover:-translate-y-1"
                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                  >
                    <div className="relative aspect-video w-full overflow-hidden" style={{ background: "var(--muted)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={posterSrc(ref) ?? ""}
                        alt={a.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <span
                        className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                        style={{ background: "oklch(0 0 0 / 0.35)" }}
                      >
                        <span
                          className="flex h-12 w-12 items-center justify-center rounded-full"
                          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                        >
                          <PlayIcon />
                        </span>
                      </span>
                    </div>
                    <div className="p-4">
                      <h4 className="text-sm font-medium leading-snug" style={{ color: "var(--fg1)" }}>
                        {a.title}
                      </h4>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Podcasts */}
        {show("podcasts") && (
          <section>
            <SectionLabel>Podcast appearances</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.podcasts.map((p) => (
                <a
                  key={p.url}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col justify-between rounded-[var(--radius-lg)] border p-5 transition-transform duration-200 hover:-translate-y-1"
                  style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                  <div>
                    <span
                      className="text-[11px] uppercase tracking-wide"
                      style={{ color: "var(--fg3)" }}
                    >
                      {p.show}
                    </span>
                    <h3 className="mt-1.5 text-base font-medium leading-snug" style={{ color: "var(--fg1)" }}>
                      {p.title}
                    </h3>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-xs" style={{ color: "var(--accent)" }}>
                    Listen <Arrow />
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Press Kit */}
        {show("presskit") && (
          <section>
            <SectionLabel>Press kit</SectionLabel>
            <a
              href={data.presskit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border p-6 transition-transform duration-200 hover:-translate-y-1"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <div>
                <h3 className="text-lg font-medium" style={{ color: "var(--fg1)" }}>
                  {data.presskit.title}
                </h3>
                {data.presskit.description && (
                  <p className="mt-1 text-sm" style={{ color: "var(--fg2)" }}>
                    {data.presskit.description}
                  </p>
                )}
              </div>
              <span className="flex items-center gap-1 text-sm" style={{ color: "var(--accent)" }}>
                Download <Arrow />
              </span>
            </a>
          </section>
        )}
      </div>

      {playing && <VideoPlayerModal video={playing} onClose={() => setPlaying(null)} />}
    </>
  );
}
