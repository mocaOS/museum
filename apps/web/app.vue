<template>
  <div class="min-h-screen bg-background font-sans font-light text-foreground">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
import { createAppKit, useAppKitAccount, useAppKitProvider, useAppKitTheme, useDisconnect } from "@reown/appkit/vue";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { mainnet } from "@reown/appkit/networks";
import { BrowserProvider } from "ethers";
import { readUsers, registerUser } from "@directus/sdk";

const colorMode = useColorMode();
const wallet = useAppKitAccount();
const { disconnect } = useDisconnect();
const { loggedIn, clear: clearSession } = useUserSession();
const { directus } = useDirectus();

const config = useRuntimeConfig();

// 1. Get projectId from https://cloud.reown.com
const projectId = "dc0c59e751982135a3cb4379d346842f";

// 2. Create your application's metadata object
const metadata = {
  name: "MOCA. Museum of Crypto Art",
  description: "The community-driven digital cryptoart museum. Our mission is to preserve the truth.",
  url: config.public.website.baseUrl, // url must match your domain & subdomain
  icons: [ `${config.public.website.baseUrl}/fav/favicon-32x32.png` ],
};

// 5. Create the modal
const appKit = createAppKit({
  adapters: [ new EthersAdapter() ],
  networks: [ mainnet ],
  defaultNetwork: mainnet,
  projectId,
  metadata,
  features: {
    email: false,
    socials: false,
    analytics: true,
    swaps: false,
    onramp: false,
  },
  enableWalletGuide: false,
});

const appKitTheme = useAppKitTheme();

async function waitFor(predicate: () => boolean, timeoutMs = 5000, intervalMs = 100) {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("Timeout waiting for condition"));
      setTimeout(check, intervalMs);
    };
    check();
  });
}

async function attemptAutoLogin() {
  try {
    if (typeof window === "undefined") return;

    // If already authenticated, skip wallet auto-login
    if (loggedIn.value) return;

    const storedSignature = localStorage.getItem("moca_signature");
    const storedAddress = localStorage.getItem("moca_signature_address");
    if (!storedSignature || !storedAddress) return;

    // Ensure wallet is connected
    if (wallet.value?.status !== "connected") return;

    let { walletProvider } = useAppKitProvider("eip155");
    if (!walletProvider) {
      await waitFor(() => !!useAppKitProvider("eip155").walletProvider);
      ({ walletProvider } = useAppKitProvider("eip155"));
    }

    // @ts-expect-error
    const provider = new BrowserProvider(walletProvider);
    const signer = await provider.getSigner();
    const address = await signer?.getAddress();
    const addressLower = address?.toLowerCase();
    if (!addressLower || addressLower !== storedAddress) {
      // Address mismatch: clear stored signature and stop
      localStorage.removeItem("moca_signature");
      localStorage.removeItem("moca_signature_address");
      return;
    }

    // Ensure user exists
    const users = await directus.request((readUsers as any)({
      fields: [ "ethereum_address" ],
      filter: { ethereum_address: { _eq: addressLower } },
      limit: 1,
    }));

    if (!users || (Array.isArray(users) && users.length === 0)) {
      await directus.request((registerUser as any)(
        `no-email@${addressLower}.com`,
        storedSignature,
        { ethereum_address: addressLower },
      ));
    }

    // Sign in via our API which sets nuxt-auth-utils session
    await $fetch("/api/auth/login", {
      method: "POST",
      body: {
        email: `no-email@${addressLower}.com`,
        password: storedSignature,
      },
    });
  } catch (e) {
    try {
      await $fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    try {
      await disconnect();
    } catch {}
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("moca_signature");
        localStorage.removeItem("moca_signature_address");
      }
    } catch {}
  }
}

onMounted(async () => {
  appKit.setThemeMode(colorMode.value === "light" ? "light" : "dark");
  appKitTheme.setThemeVariables({ "--w3m-font-family": "Poppins, sans-serif" });
  await attemptAutoLogin();
});

defineOgImage({
  url: "/social.jpg",
});
</script>

<style lang="scss">
body, html {
  background-color: #000;
  @apply font-light;

  &.light-mode {
    background-color: #fff;
  }
}
</style>
