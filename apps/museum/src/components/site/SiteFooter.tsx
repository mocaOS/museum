import Link from "next/link";

// Brand glyphs (FontAwesome isn't in this app; inline SVG, currentColor).
const ICONS: Record<string, React.ReactNode> = {
  x: <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.933zm-1.292 19.494h2.039L6.486 3.24H4.298l13.311 17.407z" />,
  youtube: <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />,
  instagram: <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />,
  farcaster: <path d="M4 4h16v2.4h-1.9V20h-3v-6.6a3.1 3.1 0 0 0-6.2 0V20h-3V6.4H4V4z" />,
  medium: <path d="M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z" />,
};

const SOCIALS = [
  { href: "https://x.com/MuseumofCrypto", label: "Twitter / X", icon: "x" },
  { href: "https://instagram.com/museumofcryptoart/", label: "Instagram", icon: "instagram" },
  { href: "https://www.youtube.com/@museumofcryptoartmc6354", label: "YouTube", icon: "youtube" },
  { href: "https://farcaster.xyz/museumofcrypto", label: "Farcaster", icon: "farcaster" },
  { href: "https://museumofcryptoart.medium.com", label: "Medium", icon: "medium" },
];

// On-site pages (left, like the top header). Manifesto and MOCA Live are now
// real pages on this site; entries already in the header nav are omitted.
const INTERNAL = [
  { href: "/manifesto", label: "Manifesto" },
  { href: "/moca-live", label: "MOCA Live" },
  { href: "/press-room", label: "Press Room" },
  { href: "/incubator", label: "Incubator" },
];

// External destinations (right) — open in a new tab.
const EXTERNAL = [
  { href: "https://vibe.museumofcryptoart.com/", label: "Vibe Studio" },
  { href: "https://opensea.io/MOCA-Genesis", label: "Our NFTs" },
  { href: "https://docs.museumofcryptoart.com", label: "Docs" },
  { href: "https://github.com/mocaOS", label: "GitHub" },
  { href: "https://museumofcrypto.substack.com/", label: "Newsletter" },
];

export default function SiteFooter() {
  return (
    <footer
      className="border-t"
      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <svg
              className="h-10 w-auto shrink-0"
              viewBox="0 0 281 156"
              fill="currentColor"
              style={{ color: "var(--fg1)" }}
              aria-hidden
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M44.4189 20.3624C70.1845 7.23401 104.136 0 140.034 0C175.931 0 209.883 7.23401 235.648 20.3624C264.299 34.9644 280.067 55.3937 280.067 77.9665C280.067 100.539 264.299 120.969 235.648 135.571C209.883 148.699 175.931 155.933 140.034 155.933C104.136 155.933 70.1845 148.699 44.4189 135.571C15.768 120.969 0 100.539 0 77.9665C0 55.4607 15.768 34.9644 44.4189 20.3624ZM266.581 77.9667C266.581 42.3325 209.95 13.3965 140.101 13.3965H140.034H138.289C69.2454 13.9323 13.554 42.6674 13.554 77.9667C13.554 113.601 70.1848 142.537 140.034 142.537H140.101H141.845C210.889 142.068 266.581 113.333 266.581 77.9667ZM177.475 47.8916C177.475 59.3224 172.458 68.5889 166.269 68.5889C160.081 68.5889 155.064 59.3224 155.064 47.8916C155.064 36.4608 160.081 27.1943 166.269 27.1943C172.458 27.1943 177.475 36.4608 177.475 47.8916ZM111.517 68.5889C117.706 68.5889 122.723 59.3224 122.723 47.8916C122.723 36.4608 117.706 27.1943 111.517 27.1943C105.329 27.1943 100.312 36.4608 100.312 47.8916C100.312 59.3224 105.329 68.5889 111.517 68.5889ZM76.7603 116.548C96.2858 125.59 116.952 128.872 136.41 129.006C155.064 129.006 171.637 126.93 187.74 121.571C201.294 117.084 213.909 110.854 223.839 100.204C230.75 92.8362 235.246 84.2626 235.179 73.8804C235.112 69.6606 232.428 67.0483 228.536 66.9813C224.577 66.9144 221.558 69.3257 221.424 73.4116C221.088 81.4494 217.196 87.4777 211.56 92.7692C202.234 101.477 191.028 106.433 179.018 109.85C153.923 116.95 128.627 117.418 103.331 111.256C88.9722 107.773 75.4855 102.348 64.6156 91.8985C59.5832 87.0758 56.0941 81.3154 55.8257 74.0814C55.7586 73.1436 55.5573 72.0719 55.1547 71.2012C53.8128 68.187 50.525 66.5795 47.4385 67.2493C44.0165 67.9191 41.8693 70.7323 41.9364 74.6172C42.0706 82.588 44.8887 89.6211 49.6527 95.9174C56.7651 105.295 66.2259 111.658 76.7603 116.548Z"
              />
            </svg>
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--fg1)" }}>
                Museum of Crypto Art
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--fg3)" }}>
                A community museum for crypto art and web3 culture.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {SOCIALS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="transition-colors"
                style={{ color: "var(--fg3)" }}
              >
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  {ICONS[s.icon]}
                </svg>
              </a>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-x-6 gap-y-4 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {INTERNAL.map((l) => (
              <Link key={l.href} href={l.href} style={{ color: "var(--fg2)" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm sm:justify-end">
            {EXTERNAL.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--fg2)" }}
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
