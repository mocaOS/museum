import type { MetadataRoute } from "next";

// Public museum is crawlable; the curation surfaces and API routes are not.
export default function robots(): MetadataRoute.Robots {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://museumofcryptoart.com";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/profile", "/upload", "/login", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
