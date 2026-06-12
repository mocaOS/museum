"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";

interface Props {
  children: React.ReactNode;
  /** Tailwind width classes for each slide. */
  itemClassName?: string;
}

// Horizontal scroll-snap carousel for card rows (e.g. featured collections on
// the landing page). Children render server-side and are passed through; each
// gets wrapped in a fixed-width snap slide. Arrow buttons appear only when
// there is overflow in that direction.
export default function CardCarousel({
  children,
  itemClassName = "w-[78vw] sm:w-[360px] lg:w-[400px]",
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateArrows]);

  const scrollBy = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  const arrowStyle = {
    background: "var(--card)",
    borderColor: "var(--border)",
    color: "var(--fg1)",
    boxShadow: "0 8px 24px oklch(0 0 0 / 0.45)",
  } as const;

  return (
    <div className="group/carousel relative">
      <div
        ref={trackRef}
        onScroll={updateArrows}
        className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 pt-1"
      >
        {Children.map(children, (child) => (
          <div className={`shrink-0 snap-start ${itemClassName}`}>{child}</div>
        ))}
      </div>

      {canLeft && (
        <button
          onClick={() => scrollBy(-1)}
          className="absolute left-0 top-1/2 z-[2] flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border transition-colors"
          style={arrowStyle}
          aria-label="Scroll left"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}
      {canRight && (
        <button
          onClick={() => scrollBy(1)}
          className="absolute right-0 top-1/2 z-[2] flex h-9 w-9 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border transition-colors"
          style={arrowStyle}
          aria-label="Scroll right"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
