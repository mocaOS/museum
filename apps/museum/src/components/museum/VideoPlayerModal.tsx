"use client";

import { useEffect, useRef, useState } from "react";
import { embedSrc, posterSrc, type VideoRef } from "@/lib/museum/video";

// On-page player. Embeds YouTube/Vimeo in a 16:9 frame with a fallback link
// below in case the embed is blocked (some videos disable embedding).
//
// Perceived load: we never hide the iframe behind our own spinner. The poster
// frame paints instantly as the backdrop and the iframe sits on top fully
// opaque, so the visitor sees the video still immediately and then YouTube's
// own player fades in — instead of staring at a spinner until the (late)
// onLoad event.
//
// Esc-to-close keeps working even after the user clicks into the player: a
// cross-origin iframe steals keyboard focus, so a window keydown listener alone
// misses Esc. We poll the active element and pull focus back to the modal
// shell whenever the iframe grabs it, so the parent keeps receiving key events.
export default function VideoPlayerModal({
  video,
  onClose,
}: {
  video: VideoRef;
  onClose: () => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const poster = posterSrc(video);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    shellRef.current?.focus();

    // Reclaim focus from the player iframe so Esc reaches us.
    const reclaim = window.setInterval(() => {
      const el = document.activeElement;
      if (el && el.tagName === "IFRAME" && shellRef.current) {
        shellRef.current.focus();
      }
    }, 250);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearInterval(reclaim);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      ref={shellRef}
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 outline-none sm:p-8"
      style={{ background: "oklch(0 0 0 / 0.92)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full transition-colors"
        style={{ color: "oklch(1 0 0)", background: "oklch(1 0 0 / 0.08)" }}
        aria-label="Close"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div
          className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-lg)] border"
          style={{ borderColor: "var(--border)", background: "oklch(0 0 0)" }}
        >
          {/* Poster paints instantly as the backdrop so the frame is visible
              the moment the modal opens; YouTube's player fades in on top. */}
          {poster && (
            <img
              src={poster}
              alt=""
              aria-hidden
              className="absolute inset-0 z-0 h-full w-full object-cover"
            />
          )}
          <iframe
            src={embedSrc(video)}
            title={video.title}
            onLoad={() => setReady(true)}
            className="absolute inset-0 z-10 h-full w-full transition-opacity duration-300"
            style={{ opacity: poster && !ready ? 0 : 1 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm" style={{ color: "oklch(0.92 0 0)" }}>
            {video.title}
          </span>
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-1 text-xs"
            style={{ color: "var(--accent)" }}
          >
            Not loading? Watch on {video.platform}
            <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
          </a>
        </div>
      </div>
    </div>
  );
}
