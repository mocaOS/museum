"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectButton } from "@/components/wallet/ConnectButton";

// `right: true` places an item in the right-hand group, just left of the
// "Enter the Library" CTA. Vibe Studio lives in the footer (and on /decc0s).
const NAV = [
  { href: "/decc0s", label: "DeCC0s" },
  { href: "/cortex", label: "Cortex" },
  { href: "/soulweaver", label: "Soulweaver" },
  { href: "/rooms", label: "ROOMs" },
  { href: "/collections", label: "Collections", right: true },
  { href: "/writings", label: "Writings", right: true },
  { href: "/timeline", label: "Timeline", right: true },
];

export default function SiteHeader({ logoUrl = "/logo.svg" }: { logoUrl?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const leftNav = NAV.filter((item) => !item.right);
  const rightNav = NAV.filter((item) => item.right);

  const renderDesktopItem = (item: (typeof NAV)[number]) => (
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
  );

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
        {/* Left: logo + primary nav */}
        <div className="flex items-center gap-1">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Museum of Crypto Art" className="h-7 w-auto" />
          </Link>
          <nav className="ml-3 hidden items-center gap-1 sm:flex">
            {leftNav.map(renderDesktopItem)}
          </nav>
        </div>

        {/* Right: secondary pages + Library CTA + wallet */}
        <nav className="hidden items-center gap-1 sm:flex">
          {rightNav.map(renderDesktopItem)}
          <Link
            href="/library"
            className="ml-2 flex h-9 items-center rounded-[var(--radius)] px-4 text-sm font-medium transition-transform active:scale-[0.98]"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Enter the Library
          </Link>
          <span className="ml-1">
            <ConnectButton />
          </span>
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
          <div className="px-3 pt-2">
            <ConnectButton />
          </div>
        </nav>
      )}
    </header>
  );
}
