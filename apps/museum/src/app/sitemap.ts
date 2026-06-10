import type { MetadataRoute } from "next";
import { listTopCollections } from "@/lib/museum/directus";

// Regenerate hourly so newly published collections surface without a redeploy.
export const revalidate = 3600;

const STATIC_PATHS = [
  "/",
  "/collections",
  "/exhibitions",
  "/exhibitions/world",
  "/soulweaver",
  "/writings",
  "/timeline",
  "/manifesto",
  "/moca-live",
  "/press-room",
  "/incubator",
  "/library",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://museumofcryptoart.com";
  const lastModified = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));

  // Collection detail pages — best-effort; if Directus is unreachable we still
  // emit a valid sitemap with the static routes rather than failing the route.
  let collectionEntries: MetadataRoute.Sitemap = [];
  try {
    const collections = await listTopCollections();
    const slugs = new Set<string>();
    for (const c of collections) {
      if (c.slug) slugs.add(c.slug);
      for (const child of c.child_collections ?? []) {
        if (child.slug) slugs.add(child.slug);
      }
    }
    collectionEntries = [...slugs].map((slug) => ({
      url: `${siteUrl}/collections/${slug}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    }));
  } catch {
    // leave collectionEntries empty
  }

  return [...staticEntries, ...collectionEntries];
}
