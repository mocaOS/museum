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
