"use client";

import { useMemo, useState } from "react";
import { posterSrc, type VideoRef } from "@/lib/museum/video";
import VideoPlayerModal from "./VideoPlayerModal";
import VideoEmbedPreconnect from "./VideoEmbedPreconnect";

interface Stream {
  id: string;
  title: string;
  date: string;
}

export interface MocaLive {
  intro: string;
  spotify: { url: string; label: string };
  streams: Stream[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(d: string): string {
  const [y, m, day] = d.split("-");
  if (!y) return "";
  if (!m) return y;
  return `${MONTHS[Number(m) - 1]} ${day ? Number(day) : ""}, ${y}`.replace("  ", " ");
}

function toVideoRef(s: Stream): VideoRef {
  return {
    url: `https://www.youtube.com/watch?v=${s.id}`,
    platform: "YouTube",
    title: s.title,
  };
}

const PlayIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7z" />
  </svg>
);

const SpotifyIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.586 14.424a.624.624 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 11-.277-1.215c3.809-.871 7.077-.496 9.713 1.115a.623.623 0 01.206.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 11-.452-1.493c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.255 1.074zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.935.935 0 11-.542-1.79c3.532-1.072 9.404-.865 13.115 1.337a.935.935 0 11-.955 1.609z" />
  </svg>
);

export default function MocaLiveBrowser({ data }: { data: MocaLive }) {
  const [playing, setPlaying] = useState<VideoRef | null>(null);
  const streams = useMemo(
    () => data.streams.slice().sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.streams]
  );

  return (
    <>
      <VideoEmbedPreconnect />
      {/* Podcast / audio */}
      <a
        href={data.spotify.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group mb-12 flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border p-5 transition-transform duration-200 hover:-translate-y-0.5"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div className="flex items-center gap-4">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ background: "#1DB954", color: "#000" }}
          >
            <SpotifyIcon />
          </span>
          <div>
            <div className="text-base font-medium" style={{ color: "var(--fg1)" }}>
              Listen to the podcast
            </div>
            <div className="text-sm" style={{ color: "var(--fg2)" }}>
              {data.spotify.label}
            </div>
          </div>
        </div>
        <span className="flex items-center gap-1 text-sm" style={{ color: "var(--accent)" }}>
          Open in Spotify
          <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
        </span>
      </a>

      <h2 className="mb-5 text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--fg3)" }}>
        {streams.length} streams
      </h2>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {streams.map((s) => (
          <button
            key={s.id}
            onClick={() => setPlaying(toVideoRef(s))}
            className="group flex flex-col overflow-hidden rounded-[var(--radius-lg)] border text-left transition-transform duration-200 hover:-translate-y-1"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div className="relative aspect-video w-full overflow-hidden" style={{ background: "var(--muted)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={posterSrc(toVideoRef(s)) ?? ""}
                alt={s.title}
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
            <div className="flex flex-1 flex-col p-4">
              <h3 className="text-sm font-medium leading-snug" style={{ color: "var(--fg1)" }}>
                {s.title}
              </h3>
              {s.date && (
                <span
                  className="mt-2 text-[11px]"
                  style={{ color: "var(--fg3)", fontFamily: "var(--font-mono)" }}
                >
                  {formatDate(s.date)}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {playing && <VideoPlayerModal video={playing} onClose={() => setPlaying(null)} />}
    </>
  );
}
