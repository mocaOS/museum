"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getConfig, getCachedConfig } from "@/lib/config";
import { CurrentUser } from "@/types/auth";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";
import UploadTab from "./_components/UploadTab";
import DocumentsTab from "./_components/DocumentsTab";
import ProcessingTab from "./_components/ProcessingTab";
import CollectionsTab from "./_components/CollectionsTab";

type TabKey = "upload" | "documents" | "processing" | "collections";

export default function UploadPage() {
  useLocale();
  const router = useRouter();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [logoUrl, setLogoUrl] = useState(
    () => getCachedConfig()?.logoUrl || "/logo.png"
  );
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabKey>("upload");

  useEffect(() => {
    getConfig().then((cfg) => setLogoUrl(cfg.logoUrl || "/logo.png"));
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return null;
        }
        return (await res.json()) as CurrentUser;
      })
      .then((u) => {
        if (!u) return;
        const isAdmin = u.role === "admin" || u.role === "superadmin";
        if (!u.canUpload && !isAdmin) {
          router.replace("/");
          return;
        }
        setMe(u);
        if (!u.canUpload && isAdmin) setTab("documents");
      })
      .finally(() => setReady(true));
  }, [router]);

  if (!ready || !me) {
    return <div className="h-dvh" style={{ background: "var(--bg)" }} />;
  }

  const isAdmin = me.role === "admin" || me.role === "superadmin";
  const tabs: { key: TabKey; label: string; show: boolean }[] = [
    { key: "upload", label: t("tabUpload"), show: me.canUpload },
    { key: "documents", label: t("tabDocuments"), show: isAdmin },
    { key: "processing", label: t("tabProcessing"), show: isAdmin },
    { key: "collections", label: t("tabCollections"), show: isAdmin },
  ];

  return (
    <div className="h-dvh flex flex-col" style={{ background: "var(--bg)" }}>
      <header
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{
          background: "oklch(0.15 0 0 / 0.65)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderColor: "var(--border)",
        }}
      >
        <Link href="/" className="flex items-center gap-3">
          <img src={logoUrl} alt="Logo" className="h-7 w-auto" />
        </Link>
        <Link
          href="/"
          className="text-[12px] transition-colors"
          style={{ color: "var(--fg2)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--fg1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--fg2)";
          }}
        >
          {t("backToChat")}
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 pt-8 pb-10">
          <div className="mb-6">
            <h1
              className="text-[24px] font-bold"
              style={{ color: "var(--fg1)", letterSpacing: "-0.015em" }}
            >
              {t("documentManagementHeading")}
            </h1>
            <p className="text-[13px] mt-1" style={{ color: "var(--fg2)" }}>
              {t("documentManagementDescription")}
            </p>
          </div>
          {isAdmin && (
            <div
              className="flex items-center gap-6 border-b mb-6"
              style={{ borderColor: "var(--border)" }}
            >
              {tabs
                .filter((x) => x.show)
                .map((x) => {
                  const active = tab === x.key;
                  return (
                    <button
                      key={x.key}
                      onClick={() => setTab(x.key)}
                      className="text-[13px] py-3 transition-colors border-b-2 -mb-px"
                      style={{
                        color: active ? "var(--fg1)" : "var(--fg2)",
                        borderColor: active ? "var(--accent)" : "transparent",
                        fontWeight: active ? 500 : 400,
                      }}
                    >
                      {x.label}
                    </button>
                  );
                })}
            </div>
          )}

          {tab === "upload" && me.canUpload && <UploadTab />}
          {tab === "documents" && isAdmin && <DocumentsTab />}
          {tab === "processing" && isAdmin && <ProcessingTab />}
          {tab === "collections" && isAdmin && <CollectionsTab />}
        </div>
      </main>
    </div>
  );
}
