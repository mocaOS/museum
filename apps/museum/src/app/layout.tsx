import type { Metadata } from "next";
import "./globals.css";
import { getAppSettings } from "@/lib/settings";
import { setLocale as setI18nLocale } from "@/lib/i18n";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import ConfigBootstrap from "@/components/ConfigBootstrap";

export const dynamic = "force-dynamic";

// Open Graph / Twitter locale uses the underscore form (en_US); map our 2-letter
// app locale to a reasonable default region.
const OG_LOCALE: Record<string, string> = { en: "en_US", de: "de_DE" };

// Title and description are read from the environment — see src/lib/settings.ts.
export async function generateMetadata(): Promise<Metadata> {
  const { appTitle, appDescription, locale } = getAppSettings();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://museumofcryptoart.com";
  const siteName = "Museum of Crypto Art";
  const ogImage = {
    url: "/social.jpg",
    width: 1200,
    height: 630,
    alt: siteName,
  };
  return {
    metadataBase: new URL(siteUrl),
    title: { default: appTitle, template: `%s · ${siteName}` },
    description: appDescription,
    applicationName: siteName,
    keywords: [
      "Museum of Crypto Art",
      "MOCA",
      "crypto art",
      "NFT",
      "digital art",
      "Web3",
      "blockchain art",
      "exhibitions",
    ],
    openGraph: {
      type: "website",
      siteName,
      title: appTitle,
      description: appDescription,
      url: siteUrl,
      locale: OG_LOCALE[locale] ?? "en_US",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: appTitle,
      description: appDescription,
      images: [ogImage.url],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
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
  const logoUrl = settings.logoUrl;
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
