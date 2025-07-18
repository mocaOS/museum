/**
 * API endpoint for generating dynamic sitemap URLs
 * This endpoint is used by the Nuxt Sitemap module to generate the sitemap.xml
 */
export default defineEventHandler(async (event) => {
  // For now, we'll return a static list of URLs.
  // In the future, this could be fetched from a database or API.
  const urls = [
    {
      loc: "/",
      lastmod: new Date().toISOString().split("T")[0],
      changefreq: "daily",
      priority: 1.0,
    },
    {
      loc: "/artists",
      lastmod: new Date().toISOString().split("T")[0],
      changefreq: "weekly",
      priority: 0.9,
    },
    {
      loc: "/collections",
      lastmod: new Date().toISOString().split("T")[0],
      changefreq: "weekly",
      priority: 0.9,
    },
    {
      loc: "/exhibitions",
      lastmod: new Date().toISOString().split("T")[0],
      changefreq: "weekly",
      priority: 0.9,
    },
    {
      loc: "/about",
      lastmod: new Date().toISOString().split("T")[0],
      changefreq: "monthly",
      priority: 0.8,
    },
    {
      loc: "/contact",
      lastmod: new Date().toISOString().split("T")[0],
      changefreq: "monthly",
      priority: 0.7,
    },
  ];

  return urls;
});
