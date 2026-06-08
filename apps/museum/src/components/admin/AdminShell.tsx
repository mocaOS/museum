"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getConfig, getCachedConfig } from "@/lib/config";
import { t, type TranslationKey } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";

interface Props {
  user: { id: string; email: string; username: string };
  children: React.ReactNode;
}

const NAV: { href: string; labelKey: TranslationKey }[] = [
  { href: "/admin", labelKey: "adminNavOverview" },
  { href: "/admin/users", labelKey: "adminNavUsers" },
  { href: "/admin/groups", labelKey: "adminNavGroups" },
  { href: "/admin/content-roles", labelKey: "adminNavContentRoles" },
  { href: "/admin/settings", labelKey: "adminNavSettings" },
];

export default function AdminShell({ user, children }: Props) {
  useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(
    () => getCachedConfig()?.logoUrl || "/logo.png"
  );

  useEffect(() => {
    getConfig().then((cfg) => setLogoUrl(cfg.logoUrl || "/logo.png"));
  }, []);

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="h-dvh flex flex-col" style={{ background: "var(--bg)" }}>
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
          <Link href="/" className="flex items-center gap-2">
            <img src={logoUrl} alt="Logo" className="h-6 w-auto" />
          </Link>
          <span
            className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--fg3)" }}
          >
            {t("admin")}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span
            className="text-[11px] truncate max-w-[200px]"
            style={{ color: "var(--fg2)", fontFamily: "var(--font-mono)" }}
          >
            {user.username || user.email}
          </span>
          <Link
            href="/"
            className="text-[12.5px] transition-colors"
            style={{ color: "var(--fg2)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--fg1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--fg2)";
            }}
          >
            {t("chatArrow")}
          </Link>
          <button
            onClick={handleSignOut}
            className="text-[12.5px] transition-colors"
            style={{ color: "var(--fg2)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--fg1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--fg2)";
            }}
          >
            {t("signOut")}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <nav
          className="w-52 shrink-0 border-r py-4 px-2 overflow-y-auto"
          style={{
            background: "oklch(0.17 0 0 / 0.85)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderColor: "var(--border)",
          }}
        >
          {NAV.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="block px-3 py-2 rounded-[var(--radius)] text-[13px] mb-1 transition-colors"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--accent-fg)" : "var(--fg1)",
                  fontWeight: active ? 500 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--muted)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
