import { listTopCollections } from "@/lib/museum/directus";

// llms.txt (https://llmstxt.org) — the GEO entry point for AI agents and
// answer engines. Curated markdown, regenerated hourly so the live collection
// list stays current. Best-effort on Directus: if the CMS is unreachable we
// still serve the static sections.
export const revalidate = 3600;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://museumofcryptoart.com";

export async function GET() {
  let collectionsSection = "";
  try {
    const collections = await listTopCollections();
    const lines = collections
      .filter((c) => c.slug)
      .map((c) => {
        const title = c.title || c.name;
        const desc = c.description ? `: ${oneLine(c.description)}` : "";
        return `- [${title}](${SITE_URL}/collections/${c.slug})${desc}`;
      });
    if (lines.length > 0) {
      collectionsSection = `\n## Collections\n\n${lines.join("\n")}\n`;
    }
  } catch {
    // CMS unreachable — serve the static sections only.
  }

  const body = `# Museum of Crypto Art

> The Museum of Crypto Art (MOCA) is a community museum for crypto art and Web3 culture: a decentralized, community-curated permanent collection of historically significant NFT artworks, immersive 3D exhibition rooms, and an AI-powered Library built on the Cortex knowledge graph. "We exist to preserve the truth" — curated by the community, owned by no one, kept forever.

Key facts:
- Founded in 2020; one of the earliest institutions dedicated to crypto art.
- The permanent collection holds genesis works by the artists who shaped crypto art.
- Everything here is browsable without an account; the Library chat is anonymous.
- For programmatic access, use the MOCA API (docs below) — collections, artworks, 3D rooms, and the Art DeCC0s knowledge base behind one API key.

## Explore

- [Collections](${SITE_URL}/collections): The permanent collection, organized by sub-collection, with artist attribution for every work.
- [MOCA ROOMs](${SITE_URL}/exhibitions): Immersive 3D exhibition rooms; includes a world builder for curating walkable exhibitions.
- [Soulweaver](${SITE_URL}/soulweaver): AI-powered personality synthesis for NFT collections — portable SOUL.md identities grounded in on-chain DNA and community lore.
- [Library](${SITE_URL}/library): Ask anything about crypto art history; answers cite sources from the MOCA Cortex knowledge graph.
${collectionsSection}
## Study

- [Writings](${SITE_URL}/writings): A reading list of the manifestos, papers, and essays that shaped crypto art.
- [Timeline](${SITE_URL}/timeline): Key moments in crypto art history.
- [Manifesto](${SITE_URL}/manifesto): What the museum stands for.
- [MOCA Live](${SITE_URL}/moca-live): Recorded conversations and streams.
- [Press Room](${SITE_URL}/press-room): Press coverage and artist interviews.

## Build

- [MOCA API documentation](https://docs.museumofcryptoart.com): Guides and full API reference.
- [MOCA API llms.txt](https://docs.museumofcryptoart.com/llms.txt): Agent-first index of the API docs.
- [MOCA Skills](https://docs.museumofcryptoart.com/SKILL.md): Skill handbook for AI agents integrating with MOCA.
- [GitHub](https://github.com/mocaOS): The museum's open-source stack.

## Optional

- [Art DeCC0s](https://codex.decc0s.com): 10,000 AI-native characters born from the museum's collection.
- [Newsletter](https://museumofcrypto.substack.com): Long-form essays and museum news.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function oneLine(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}…` : flat;
}
