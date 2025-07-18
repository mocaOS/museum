<template>
  <div class="container mt-10 space-y-14">
    <div class="bg-background-200 border-gray mx-auto max-w-[580px] space-y-12 rounded-xl border p-4 sm:rounded-3xl sm:p-14">
      <NuxtImg preload width="112" src="/images/globe.png" alt="Globe" class="mx-auto" />
      <h1 class="text-center text-3xl font-semibold">
        The Museum
      </h1>

      <Button
        @click="handleLogin"
        class="w-full"
      >
        Login
      </Button>
    </div>
  </div>
  <footer class="container mt-12 pb-10 text-center text-sm text-white/50">
    <div class="mx-auto max-w-[610px] leading-6">
      <p class="mb-8 underline decoration-white/20">
        <a href="https://museumofcryptoart.com/" target="_blank">
          © {{ new Date().getFullYear() }}, Museum of Crypto Art
        </a>
      </p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import type { CustomDirectusTypes } from "@local/types/directus";
import { useAppKitProvider } from "@reown/appkit/vue";
import { BrowserProvider } from "ethers";

const { user } = useDirectusAuth<CustomDirectusTypes>();
const { login, logout } = useDirectusAuth();

async function handleLogin() {
  if (user.value) await logout();

  const { walletProvider } = useAppKitProvider("eip155");
  // @ts-expect-error
  const provider = new BrowserProvider(walletProvider);
  const signer = await provider.getSigner();
  const address = await signer?.getAddress();

  const message = `Welcome to the Museum of Crypto Art!\n\nSign this message login. No password needed.\n\nWallet address:\n${address.toLowerCase()}`;

  const signature = await signer?.signMessage(message);

  await login(`no-email@${address.toLowerCase()}.com`, signature);
}
</script>
