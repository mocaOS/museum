<template>
  <div class="bg-background min-h-screen font-sans text-foreground font-light">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
import { createAppKit } from "@reown/appkit/vue";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { mainnet } from "@reown/appkit/networks";

const colorMode = useColorMode();

// 1. Get projectId from https://cloud.reown.com
const projectId = "dc0c59e751982135a3cb4379d346842f";

// 2. Create your application's metadata object
const metadata = {
  name: "MOCA. Museum of Crypto Art",
  description: "The community-driven digital cryptoart museum. Our mission is to preserve the truth.",
  url: "https://v2.museumofcryptoart.com/", // url must match your domain & subdomain
  icons: [ "https://v2.museumofcryptoart.com/fav/favicon-32x32.png" ],
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

onMounted(() => {
  appKit.setThemeMode(colorMode.value === "light" ? "light" : "dark");
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
