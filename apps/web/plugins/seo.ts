// plugins/seo.ts
import { defineNuxtPlugin } from "#app";

export default defineNuxtPlugin(() => {
  const route = useRoute();

  // Set up default SEO meta tags for all pages
  useSeoMeta({
    title: () => {
      // If the page has a custom title, use it, otherwise use the default
      const pageTitle = route.meta.title as string || "";
      // If there's a page title, it will be formatted with the site name using the separator
      // Otherwise, just return the site name
      return pageTitle ? `${pageTitle}` : "MOCA. Museum of Crypto Art";
    },
    ogTitle: () => {
      const pageTitle = route.meta.title as string || "";
      return pageTitle ? `${pageTitle} · MOCA. Museum of Crypto Art` : "MOCA. Museum of Crypto Art";
    },
    description: () => {
      return (route.meta.description as string) || "The community-driven digital cryptoart museum. Our mission is to preserve the truth.";
    },
    ogDescription: () => {
      return (route.meta.description as string) || "The community-driven digital cryptoart museum. Our mission is to preserve the truth.";
    },
    ogImage: () => {
      return (route.meta.ogImage as string) || "/social.jpg";
    },
    twitterCard: "summary_large_image",
  });
});
