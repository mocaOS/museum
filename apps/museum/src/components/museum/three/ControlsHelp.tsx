"use client";

import type { ReactNode } from "react";

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Camera",
    rows: [
      [ "W A S D / arrows", "Pan" ],
      [ "Q / E", "Rotate" ],
      [ "Scroll", "Zoom to cursor" ],
      [ "Right-drag", "Orbit" ],
      [ "Middle-drag", "Pan" ],
      [ "Screen edges", "Edge-scroll" ],
      [ "Shift", "Move faster" ],
      [ "Home", "Reset view" ],
    ],
  },
  {
    title: "Building",
    rows: [
      [ "Click room card", "Start placing" ],
      [ "Click ground", "Drop room" ],
      [ "R / Shift+R", "Rotate room" ],
      [ "Right-click / Esc", "Stop placing" ],
      [ "Drag room", "Move it" ],
      [ "Double-click room", "Focus" ],
      [ "C", "Curate selected" ],
      [ "F", "Focus selected" ],
      [ "Del", "Remove selected" ],
    ],
  },
  {
    title: "Curating",
    rows: [
      [ "Click glowing slot", "Choose wall slot" ],
      [ "Click artwork card", "Hang it" ],
      [ "Drag artwork", "Move on wall" ],
      [ "Corner dot", "Resize" ],
      [ "Del", "Clear slot" ],
      [ "Esc", "Finish curating" ],
    ],
  },
];

function NavBtn({
  children,
  onClick,
  active,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`
        flex h-9 w-9 items-center justify-center rounded-full border
        transition-colors
      `}
      style={{
        background: active ? "var(--accent)" : "oklch(0.14 0 0 / 0.82)",
        borderColor: active ? "var(--accent)" : "var(--border)",
        color: active ? "var(--accent-fg)" : "var(--fg1)",
        backdropFilter: "blur(12px)",
      }}
    >
      {children}
    </button>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width={16}
      height={16}
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

/**
 * Bottom-right navigation cluster (zoom in/out, reset view, help toggle) plus
 * the controls reference that slides in along the right edge when toggled.
 */
export default function ControlsHelp({
  open,
  onToggle,
  onClose,
  onResetView,
  onZoomIn,
  onZoomOut,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onResetView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <>
      <div className={`
        pointer-events-auto absolute right-3 bottom-3 z-30 flex flex-col gap-1.5
      `}>
        <NavBtn onClick={onZoomIn} label="Zoom in">
          <Icon>
            <path d="M12 5v14M5 12h14" />
          </Icon>
        </NavBtn>
        <NavBtn onClick={onZoomOut} label="Zoom out">
          <Icon>
            <path d="M5 12h14" />
          </Icon>
        </NavBtn>
        <NavBtn onClick={onResetView} label="Reset view (Home)">
          <Icon>
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <path d="M9 22V12h6v10" />
          </Icon>
        </NavBtn>
        <NavBtn onClick={onToggle} active={open} label="Controls (H)">
          <Icon>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </Icon>
        </NavBtn>
      </div>

      <div
        className={`
          pointer-events-auto absolute right-14 bottom-3 z-30 flex w-72 flex-col
          rounded-[var(--radius-xl)] border transition-all duration-300 ease-out
          ${
          open
? "translate-x-0 opacity-100"
: "pointer-events-none translate-x-3 opacity-0"
        }
        `}
        style={{
          maxHeight: "calc(100% - 1.5rem)",
          background: "oklch(0.12 0 0 / 0.94)",
          borderColor: "var(--border)",
          backdropFilter: "blur(20px)",
        }}
        aria-hidden={!open}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--fg1)" }}>
              Controls
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: "var(--fg3)" }}>
              Press H to toggle
            </div>
          </div>
          <button
            onClick={onClose}
            className={`
              flex h-7 w-7 items-center justify-center rounded-full
              transition-colors
            `}
            style={{ color: "var(--fg2)", background: "var(--muted)" }}
            aria-label="Close"
          >
            <Icon>
              <path d="M18 6 6 18M6 6l12 12" />
            </Icon>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {GROUPS.map(g => (
            <div key={g.title} className={`
              mb-3
              last:mb-0
            `}>
              <div
                className="mb-1.5 text-[10px] tracking-[0.08em] uppercase"
                style={{ color: "var(--fg3)" }}
              >
                {g.title}
              </div>
              {g.rows.map(([ k, v ]) => (
                <div key={k} className={`
                  flex items-center justify-between py-0.5 text-[11px]
                `}>
                  <kbd
                    className="rounded px-1.5 py-0.5"
                    style={{
                      background: "var(--muted)",
                      color: "var(--fg1)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {k}
                  </kbd>
                  <span className="ml-2 text-right" style={{ color: "var(--fg2)" }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
