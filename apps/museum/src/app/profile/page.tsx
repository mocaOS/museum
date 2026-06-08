"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getConfig, getCachedConfig } from "@/lib/config";
import { CurrentUser } from "@/types/auth";
import { Button, ErrorBanner, Input } from "@/components/admin/ui";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";

export default function ProfilePage() {
  useLocale();
  const router = useRouter();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [username, setUsername] = useState("");
  const [avatarBust, setAvatarBust] = useState(0);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [logoUrl, setLogoUrl] = useState(
    () => getCachedConfig()?.logoUrl || "/logo.png"
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    if (res.status === 401) {
      router.replace("/login");
      return null;
    }
    const data = (await res.json()) as CurrentUser;
    setMe(data);
    setUsername(data.username);
    return data;
  }, [router]);

  useEffect(() => {
    getConfig().then((cfg) => setLogoUrl(cfg.logoUrl || "/logo.png"));
    refreshMe();
  }, [refreshMe]);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("saveFailed"));
      }
      setProfileMsg(t("saved"));
      await refreshMe();
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAvatarUpload(file: File) {
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("uploadFailed"));
      }
      await refreshMe();
      setAvatarBust(Date.now());
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleAvatarRemove() {
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const res = await fetch("/api/me/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error(t("removeFailed"));
      await refreshMe();
      setAvatarBust(Date.now());
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : t("removeFailed"));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      const res = await fetch("/api/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("saveFailed"));
      }
      setPasswordMsg(t("passwordUpdated"));
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordMsg(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSavingPassword(false);
    }
  }

  if (!me) {
    return <div className="h-dvh bg-[var(--bg-primary)]" />;
  }

  const avatarSrc = me.avatarUrl ? `${me.avatarUrl}?v=${avatarBust}` : null;

  return (
    <div className="h-dvh flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <Link href="/" className="flex items-center gap-3">
          <img src={logoUrl} alt="Logo" className="h-7 w-auto" />
        </Link>
        <Link
          href="/"
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {t("backToChat")}
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 py-10 space-y-8">
          <div>
            <h1 className="text-xl font-semibold">{t("profileHeading")}</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {t("profileSignedInAs")}{" "}
              <span className="text-[var(--text-primary)]">{me.email}</span>
            </p>
          </div>

          {/* Avatar */}
          <section className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-5 space-y-4">
            <div className="text-sm font-medium">{t("avatar")}</div>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg bg-[var(--bg-tertiary)] overflow-hidden flex items-center justify-center text-[var(--text-secondary)]">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                    />
                  </svg>
                )}
              </div>
              <div className="flex gap-2">
                <label
                  className={`px-3 py-2 rounded-lg text-sm bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:brightness-110 cursor-pointer ${uploadingAvatar ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {t("chooseImage")}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    disabled={uploadingAvatar}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAvatarUpload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {me.avatarUrl && (
                  <Button
                    variant="ghost"
                    onClick={handleAvatarRemove}
                    disabled={uploadingAvatar}
                    className="hover:!text-red-400"
                  >
                    {t("remove")}
                  </Button>
                )}
              </div>
            </div>
            <ErrorBanner message={avatarError} />
            <p className="text-xs text-[var(--text-secondary)]">
              {t("avatarHint")}
            </p>
          </section>

          {/* Username */}
          <section className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-5 space-y-4">
            <div className="text-sm font-medium">{t("profileHeading")}</div>
            <form onSubmit={handleProfileSave} className="space-y-3">
              <Input
                label={t("username")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={80}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--text-secondary)]">
                  {profileMsg}
                </span>
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? t("saving") : t("save")}
                </Button>
              </div>
            </form>
          </section>

          {/* Password */}
          <section className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-5 space-y-4">
            <div className="text-sm font-medium">{t("password")}</div>
            <form onSubmit={handlePasswordSave} className="space-y-3">
              <Input
                label={t("currentPassword")}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <Input
                label={t("newPasswordMin")}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--text-secondary)]">
                  {passwordMsg}
                </span>
                <Button
                  type="submit"
                  disabled={
                    savingPassword || !currentPassword || newPassword.length < 8
                  }
                >
                  {savingPassword ? t("saving") : t("changePassword")}
                </Button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
