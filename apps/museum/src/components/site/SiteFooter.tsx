import Link from "next/link";

const LINKS = [
  { href: "/collections", label: "Collections" },
  { href: "/exhibitions", label: "Exhibitions" },
  { href: "/writings", label: "Writings" },
  { href: "/timeline", label: "Timeline" },
  { href: "/incubator", label: "Incubator" },
  { href: "/library", label: "Library" },
];

const EXTERNAL = [
  { href: "https://docs-library.moca.qwellco.de/introduction", label: "Cortex docs" },
  { href: "https://github.com/mocaOS/museum", label: "GitHub" },
];

export default function SiteFooter() {
  return (
    <footer
      className="border-t"
      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <div className="text-sm font-medium" style={{ color: "var(--fg1)" }}>
            Museum of Crypto Art
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--fg3)" }}>
            A community museum for crypto art and Web3 culture.
          </div>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} style={{ color: "var(--fg2)" }}>
              {l.label}
            </Link>
          ))}
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
    </footer>
  );
}
