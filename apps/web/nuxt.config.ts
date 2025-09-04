import tailwindcss from "@tailwindcss/vite";

// https://nuxt.com/docs/api/configuration/nuxt-config
import config from "@local/config";

export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",

  devtools: {
    enabled: true,
  },

  runtimeConfig: {
    // Server-side only config - not exposed to client
    authSecret: process.env.NUXT_AUTH_SECRET || (process.env.NODE_ENV !== "production" ? "dev-moca-auth-secret" : undefined),
    r2r: {
      // Get R2R credentials from environment variables
      url: process.env.R2R_URL || config.r2r?.url,
      email: process.env.R2R_EMAIL,
      password: process.env.R2R_PASSWORD,
    },
    litellm: {
      url: process.env.LITELLM_URL,
      apiKey: process.env.LITELLM_API_KEY,
      model: process.env.LITELLM_MODEL,
    },
    public: {
      ...config,
      // Override r2r config to only include public parts (URL and API key)
      r2r: {
        url: process.env.R2R_URL || config.r2r?.url,
        apiKey: process.env.R2R_API_KEY || config.r2r?.apiKey,
      } as any, // Type assertion to bypass TypeScript checking
    },
  },

  modules: [
    "shadcn-nuxt",
    "@nuxtjs/color-mode",
    "@nuxt/image",
    "@nuxt/fonts",
    "@nuxtjs/seo",
    "@vueuse/nuxt",
    "@nuxtjs/strapi",
    "@nuxt/icon",
    "@sidebase/nuxt-auth",
    "nuxt-mcp",
  ],

  css: [
    "~/assets/css/tailwind.css",
  ],

  vite: {
    plugins: [
      tailwindcss(),
    ],
  },

  // vite: {
  //   optimizeDeps: {
  //     exclude: [
  //       "@reown/appkit",
  //       "@reown/appkit-adapter-ethers",
  //       "@reown/appkit-adapter-wagmi",
  //       "@reown/appkit/vue",
  //       "@reown/appkit/networks",
  //       "@solana/web3.js",
  //       "@solana/web3.js/lib/index.esm",
  //       "@solana/wallet-adapter-base",
  //       "@wagmi/core",
  //       "@wagmi/vue",
  //       "ethers",
  //       "viem",
  //     ],
  //     include: [
  //       "vue",
  //       "vue-router",
  //       "@vueuse/core",
  //     ],
  //   },
  //   build: {
  //     commonjsOptions: {
  //       transformMixedEsModules: true,
  //     },
  //   },
  // },

  auth: {
    baseURL: process.env.NODE_ENV === "production" ? "https://v2.museumofcryptoart.com/api/auth" : "http://localhost:3000/api/auth",
    provider: {
      type: "authjs",
      trustHost: true,
      defaultProvider: "credentials",
      addDefaultCallbackUrl: false,
    },
    globalAppMiddleware: false,
  },

  strapi: {
    url: "https://api.museumofcryptoart.com",
    prefix: "/api",
    admin: "/admin",
    version: "v3",
    cookie: {},
    cookieName: "strapi_jwt",
  },

  image: {
    directus: {
      // This URL needs to include the final `assets/` directory
      baseURL: `${config.api.baseUrl}/assets`,
    },
    inject: true,
    densities: [ 1, 2 ], // This is default, maybe switch to only 1x later if performance is an issue
    providers: {
      transformIn: {
        name: "transform-in",
        provider: "~/providers/transform-in",
      },
      mediaproxy: {
        name: "mediaproxy",
        provider: "~/providers/mediaproxy",
        options: {
          baseURL: config.media.baseUrl,
        },
      },
    },
    provider: "ipx",
  },

  // Auth module configuration is provided by @sidebase/nuxt-auth when installed.

  icon: {
    provider: "server",
    mode: "svg",
    customCollections: [
      {
        prefix: "moca",
        dir: "./svg/moca",
      },
    ],
  },

  shadcn: {
    /**
     * Prefix for all the imported component
     */
    prefix: "",
    /**
     * Directory that the component lives in.
     * @default "./components/ui"
     */
    componentDir: "./components/ui",
  },

  site: {
    url: "https://v2.museumofcryptoart.com/",
    name: "MOCA. Museum of Crypto Art",
    description: "The community-driven digital cryptoart museum. Our mission is to preserve the truth.",
    titleSeparator: "·",
    indexable: process.env.NODE_ENV === "production",
    trailingslash: false,
  },

  robots: {
    blockAiBots: true, // Block AI crawlers like GPTBot, Claude, etc.
  },

  sitemap: {
    sources: [ "/api/sitemap-urls" ], // Dynamic URLs endpoint if needed
  },

  schemaOrg: {
    // Configure Schema.org structured data
    identity: {
      type: "Organization",
      name: "MOCA. Museum of Crypto Art",
      url: "https://v2.museumofcryptoart.com/",
      logo: "https://v2.museumofcryptoart.com/social.jpg",
      sameAs: [
        "https://x.com/MuseumofCrypto",
        "https://www.instagram.com/museumofcryptoart/",
        // Add other social profiles if available
      ],
    },
  },

  colorMode: {
    preference: "dark",
    classSuffix: "",
  },

  app: {
    head: {
      link: [
        {
          rel: "icon",
          type: "image/png",
          href: "/fav/favicon-32x32.png",
        },
        {
          rel: "icon",
          type: "image/png",
          href: "/fav/favicon-16x16.png",
        },
        {
          rel: "manifest",
          href: "/fav/site.webmanifest",
        },
        {
          rel: "mask-icon",
          href: "/fav/safari-pinned-tab.svg",
          color: "#ffffff",
        },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "/fav/apple-touch-icon.png",
        },
        {
          rel: "shortcut icon",
          href: "/fav/favicon.ico",
        },
      ],
      meta: [
        {
          charset: "utf-8",
        },
        {
          name: "msapplication-TileColor",
          content: "#000000",
        },
        {
          name: "msapplication-config",
          content: "/fav/browserconfig.xml",
        },
        {
          name: "theme-color",
          content: "#ffffff",
        },
        {
          name: "fortmatic-site-verification",
          content: "jb7k3cv4cILNznzp",
        },
      ],
    },
  },

  fonts: {
    provider: "custom", // Using custom provider for local fonts
  },
});
