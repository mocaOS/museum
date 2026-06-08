import type { Metadata } from "next";
import "./globals.css";
import { getAppSettings } from "@/lib/settings";
import { resolveLogoUrl } from "@/lib/branding-url";
import { setLocale as setI18nLocale } from "@/lib/i18n";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import ConfigBootstrap from "@/components/ConfigBootstrap";

export const dynamic = "force-dynamic";

// Title and description are superadmin-editable via /admin/settings.
export async function generateMetadata(): Promise<Metadata> {
  const { appTitle, appDescription } = getAppSettings();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://museumofcryptoart.com";
  return {
    metadataBase: new URL(siteUrl),
    title: { default: appTitle, template: "%s · Museum of Crypto Art" },
    description: appDescription,
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icons/favicon-16.png", type: "image/png", sizes: "16x16" },
        { url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" },
        { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
        { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
      ],
      apple: [{ url: "/icons/apple-icon.png", sizes: "180x180" }],
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = getAppSettings();
  const logoUrl = resolveLogoUrl(settings);
  setI18nLocale(settings.locale);

  const initialConfig = {
    accentColor: settings.accentColor,
    logoUrl,
    locale: settings.locale,
    appTitle: settings.appTitle,
    appDescription: settings.appDescription,
    supportUrl: settings.supportUrl,
    supportLabel: settings.supportLabel,
    maxUploadBytes: MAX_UPLOAD_BYTES,
  };

  return (
    <html
      lang={settings.locale}
      className="dark"
      style={{ ["--accent" as string]: settings.accentColor }}
    >
      <body className="antialiased">
        <ConfigBootstrap config={initialConfig}>{children}</ConfigBootstrap>
      </body>
    </html>
  );
}
