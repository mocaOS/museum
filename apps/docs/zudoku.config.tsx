import type { ZudokuConfig } from "zudoku";
import LibraryWidget from "./src/LibraryWidget";

/**
 * MOCA API documentation — built with Zudoku (https://zudoku.dev), the same
 * framework the Art DeCC0s docs (https://docs.decc0s.com) use, so integrators
 * get a consistent experience across the MOCA ecosystem.
 */
const config: ZudokuConfig = {
  site: {
    title: "MOCA API",
    // Logo replaces the title text in the header (title remains the alt-text
    // fallback). White wordmark for dark mode, MOCA navy for light mode.
    logo: {
      src: {
        light: "/moca-logo-light.svg",
        dark: "/moca-logo-dark.svg",
      },
      alt: "Museum of Crypto Art",
      width: "130px",
    },
  },
  search: {
    type: "pagefind",
  },
  metadata: {
    title: "MOCA API Documentation",
    description:
      "Build with the Museum of Crypto Art: collections, artworks, 3D exhibition rooms, and the Art DeCC0s knowledge base behind one API key.",
  },
  navigation: [
    {
      type: "category",
      label: "Documentation",
      items: [
        "introduction",
        "quickstart",
        "authentication",
        "architecture",
        "integration",
        "library",
        "web3",
        "hyperfy",
        "skills",
        {
          type: "category",
          label: "Useful Links",
          icon: "link",
          collapsible: true,
          collapsed: false,
          items: [
            {
              type: "link",
              to: "https://docs.museumofcryptoart.com/llms.txt",
              label: "llms.txt",
              icon: "file-text",
            },
            {
              type: "link",
              to: "https://docs.museumofcryptoart.com/llms-full.txt",
              label: "llms-full.txt",
              icon: "file-text",
            },
            {
              type: "link",
              // Synced from apis/moca-v1.json by the prebuild/predev scripts.
              to: "https://docs.museumofcryptoart.com/openapi.json",
              label: "OpenAPI spec",
              icon: "file-json",
            },
            {
              type: "link",
              to: "https://museumofcryptoart.com",
              label: "museumofcryptoart.com",
              icon: "landmark",
            },
            {
              type: "link",
              to: "https://docs.decc0s.com",
              label: "Art DeCC0s docs",
              icon: "book-open",
            },
            {
              type: "link",
              to: "https://docs.cortex.eco",
              label: "Cortex docs",
              icon: "book-open",
            },
          ],
        },
      ],
    },
    {
      type: "link",
      to: "/api",
      label: "API Reference",
    },
  ],
  redirects: [{ from: "/", to: "/introduction" }],
  slots: {
    // The Library chat — floating bottom-right on every docs page (the widget
    // is position:fixed, so the header slot is just its mount point; the site
    // has no footer for a footer slot to render in). History is
    // localStorage-only; presence is an ephemeral broadcast (see the widget).
    "head-navigation-end": () => <LibraryWidget />,
  },
  docs: {
    files: "pages/**/*.{md,mdx}",
    publishMarkdown: true,
    llms: {
      llmsTxt: true,
      llmsTxtFull: true,
    },
  },
  apis: [
    {
      type: "file",
      input: "./apis/moca-v1.json",
      path: "/api",
    },
  ],
};

export default config;
