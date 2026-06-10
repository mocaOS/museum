/**
 * SEO + GEO helpers: canonical site URL and schema.org JSON-LD builders.
 *
 * Structured data strategy (consumed by search engines AND answer engines —
 * Google AI Overviews, Perplexity, ChatGPT browsing all read JSON-LD):
 * - Organization + WebSite ship once, on every page, from the root layout.
 * - Collection pages add BreadcrumbList + CollectionPage with an ItemList of
 *   VisualArtwork (name / creator / image of the works on the current page).
 * - Writings adds an ItemList of scholarly Articles (external canonical URLs).
 * Builders return plain objects; render them with <JsonLd data={...} />.
 */

export const SITE_NAME = "Museum of Crypto Art";

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://museumofcryptoart.com";
}

/** Absolute URL for a site-relative path. */
export function absUrl(path: string): string {
  return new URL(path, getSiteUrl()).toString();
}

// Mirror of the social rail in SiteFooter — sameAs links tie the Organization
// node to its verified profiles across the open + crypto-native web.
const SAME_AS = [
  "https://x.com/MuseumofCrypto",
  "https://instagram.com/museumofcryptoart/",
  "https://www.youtube.com/@museumofcryptoartmc6354",
  "https://farcaster.xyz/museumofcrypto",
  "https://museumofcryptoart.medium.com",
  "https://github.com/mocaOS",
  "https://opensea.io/MOCA-Genesis",
  "https://museumofcrypto.substack.com",
];

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${getSiteUrl()}/#organization`,
    name: SITE_NAME,
    alternateName: "MOCA",
    url: getSiteUrl(),
    logo: {
      "@type": "ImageObject",
      url: absUrl("/icons/icon-512.png"),
      width: 512,
      height: 512,
    },
    description:
      "A community museum for crypto art and Web3 culture — a decentralized, community-curated permanent collection, immersive 3D exhibitions, and an AI-powered Library.",
    foundingDate: "2020",
    sameAs: SAME_AS,
  };
}

export function webSiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${getSiteUrl()}/#website`,
    name: SITE_NAME,
    alternateName: "MOCA",
    url: getSiteUrl(),
    publisher: { "@id": `${getSiteUrl()}/#organization` },
    inLanguage: "en",
  };
}

export function breadcrumbLd(crumbs: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absUrl(c.path),
    })),
  };
}

export interface ArtworkLdInput {
  name?: string | null;
  artistName?: string | null;
  imageUrl?: string | null;
}

export function collectionPageLd(opts: {
  name: string;
  description?: string | null;
  path: string;
  artworks: ArtworkLdInput[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    url: absUrl(opts.path),
    isPartOf: { "@id": `${getSiteUrl()}/#website` },
    about: { "@id": `${getSiteUrl()}/#organization` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: opts.artworks.length,
      itemListElement: opts.artworks
        .filter((a) => a.name)
        .map((a, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "VisualArtwork",
            name: a.name,
            ...(a.artistName
              ? { creator: { "@type": "Person", name: a.artistName } }
              : {}),
            ...(a.imageUrl ? { image: a.imageUrl } : {}),
            artMedium: "Digital",
            artform: "Crypto Art",
          },
        })),
    },
  };
}

export interface WritingLdInput {
  title: string;
  author?: string | null;
  date?: string | null;
  url: string;
}

export function writingsListLd(items: WritingLdInput[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Crypto art writings — a living reading list",
    numberOfItems: items.length,
    itemListElement: items.map((w, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Article",
        headline: w.title,
        url: w.url,
        ...(w.author ? { author: { "@type": "Person", name: w.author } } : {}),
        ...(w.date ? { datePublished: w.date } : {}),
      },
    })),
  };
}
