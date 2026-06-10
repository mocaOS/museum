import type { MetadataRoute } from "next";

// The public museum is fully crawlable; only API routes are off-limits.
//
// GEO: AI/answer-engine crawlers are explicitly welcomed. Being citable inside
// ChatGPT, Claude, Perplexity, and Google AI Overviews is a distribution goal
// for the museum, so the major AI user agents get their own allow rules rather
// than relying on the wildcard (some operators treat an explicit rule group as
// a stronger signal, and it keeps the policy legible).
const AI_CRAWLERS = [
  "GPTBot", // OpenAI training + search
  "OAI-SearchBot", // ChatGPT search citations
  "ChatGPT-User", // ChatGPT live browsing
  "ClaudeBot", // Anthropic
  "Claude-User", // Claude live browsing
  "PerplexityBot", // Perplexity index
  "Perplexity-User", // Perplexity live browsing
  "Google-Extended", // Gemini grounding
  "Applebot-Extended", // Apple Intelligence
  "meta-externalagent", // Meta AI
  "Bytespider", // ByteDance / Doubao
  "Amazonbot",
  "DuckAssistBot",
  "cohere-ai",
];

export default function robots(): MetadataRoute.Robots {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://museumofcryptoart.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: ["/api/"],
      })),
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
