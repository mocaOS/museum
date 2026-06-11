"use client";

import Link from "next/link";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";
import { getCachedConfig } from "@/lib/config";

// Keep in sync with the museum nav in components/site/SiteHeader.tsx
// (plus "Home", since the Library has no other way back to the site).
// `right: true` places an item in the right-hand group, next to "Library".
const NAV = [
  { href: "/", label: "Home" },
  { href: "/decc0s", label: "Art DeCC0s" },
  { href: "/soulweaver", label: "Soulweaver" },
  { href: "/cortex", label: "Cortex" },
  { href: "/rooms", label: "ROOMs" },
  { href: "/collections", label: "Collections", right: true },
  { href: "/writings", label: "Writings", right: true },
  { href: "/timeline", label: "Timeline", right: true },
];

const leftNav = NAV.filter((item) => !item.right);
const rightNav = NAV.filter((item) => item.right);

export default function Header({
  logoUrl,
  onToggleSidebar,
}: {
  logoUrl: string;
  onToggleSidebar: () => void;
}) {
  useLocale();
  // Support link is seeded server-side via ConfigBootstrap, so it's present
  // on first paint. Empty URL → no button. Empty label → localized fallback.
  const cfg = getCachedConfig();
  const supportUrl = cfg?.supportUrl?.trim() || "";
  const supportLabel = cfg?.supportLabel?.trim() || t("support");
  return (
    <header
      className="flex items-center justify-between px-5 h-14 border-b"
      style={{
        background: "oklch(0.15 0 0 / 0.65)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="w-8 h-8 rounded-[var(--radius)] flex items-center justify-center text-[var(--fg2)] hover:text-[var(--fg1)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
          aria-label={t("toggleSidebar")}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Museum of Crypto Art" className="h-6 w-auto" />
        </Link>
        {/* Museum menubar — navigate out of the Library back into the museum */}
        <nav className="ml-2 hidden items-center gap-1 sm:flex">
          {leftNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[var(--radius)] px-3 py-1.5 text-sm transition-colors"
              style={{ color: "var(--fg2)" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-1">
        <nav className="hidden items-center gap-1 sm:flex">
          {rightNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[var(--radius)] px-3 py-1.5 text-sm transition-colors"
              style={{ color: "var(--fg2)" }}
            >
              {item.label}
            </Link>
          ))}
          <span
            className="rounded-[var(--radius)] px-3 py-1.5 text-sm"
            style={{ color: "var(--fg1)" }}
          >
            Library
          </span>
        </nav>
        {supportUrl ? (
          <a
            href={supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={supportLabel}
            className="group relative w-9 h-9 rounded-[var(--radius)] flex items-center justify-center text-[var(--accent)] hover:text-white hover:bg-[var(--muted)] transition-colors cursor-pointer"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
            {/* Instant CSS tooltip — native title attribute has a browser hover delay */}
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-[var(--radius-sm)] border px-2.5 py-1 text-[13px] opacity-0 group-hover:opacity-100 transition-opacity duration-100"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
                color: "var(--fg1)",
                boxShadow: "var(--shadow-xl)",
              }}
            >
              {supportLabel}
            </span>
          </a>
        ) : null}
      </div>
    </header>
  );
}
