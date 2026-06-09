"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/collections", label: "Collections" },
  { href: "/exhibitions", label: "Exhibitions" },
  { href: "/writings", label: "Writings" },
  { href: "/timeline", label: "Timeline" },
];

export default function SiteHeader({ logoUrl = "/logo.svg" }: { logoUrl?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: "oklch(0.14 0 0 / 0.72)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderColor: "var(--border)",
      }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Museum of Crypto Art" className="h-7 w-auto" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 sm:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative rounded-[var(--radius)] px-3.5 py-2 text-sm transition-colors"
              style={{ color: isActive(item.href) ? "var(--fg1)" : "var(--fg2)" }}
            >
              {item.label}
              {isActive(item.href) && (
                <span
                  className="absolute inset-x-3 -bottom-px h-px"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </Link>
          ))}
          <Link
            href="/library"
            className="ml-2 flex h-9 items-center rounded-[var(--radius)] px-4 text-sm font-medium transition-transform active:scale-[0.98]"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Enter the Library
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] sm:hidden"
          style={{ color: "var(--fg1)" }}
          aria-label="Menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {open ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav
          className="border-t px-5 py-3 sm:hidden"
          style={{ borderColor: "var(--border)" }}
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-[var(--radius)] px-3 py-2.5 text-sm"
              style={{ color: isActive(item.href) ? "var(--fg1)" : "var(--fg2)" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
