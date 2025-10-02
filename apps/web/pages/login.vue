<template>
  <div class="container mt-10">
    <div
      class="
        mx-auto max-w-[580px] space-y-12 rounded-xl border border-border
        bg-background p-4
        sm:rounded-3xl sm:p-14
      "
    >
      <h1 class="text-3xl font-semibold">
        Login
      </h1>

      <div>
        <p class="mt-1 text-sm text-muted-foreground">
          Connect your wallet and sign once to authenticate.
        </p>
        <Button
          @click="handleConnectAndLogin"
          :disabled="loading || appKitState.open || !isMounted"
          :loading="loading || appKitState.open"
          class="mt-6 w-full"
        >
          <span v-if="wallet.status === 'connected'" class="font-mono text-sm">{{ wallet.address }}</span>
          <span v-else>Connect & Sign In</span>
        </Button>

        <div
          v-if="responseMessage.message"
          :class="cn('mt-4 flex items-center text-sm response-message', responseMessage.type === 'success' ? `
            text-green-500
          ` : `text-red-500`)"
        >
          <Icon
            v-if="responseMessage.type === 'success'"
            icon="iconamoon:check-circle-1"
            class="mr-1 h-5 w-5 shrink-0"
          />
          <Icon
            v-else
            icon="iconamoon:sign-times-circle"
            class="mr-1 h-5 w-5 shrink-0"
          />
          {{ responseMessage.message }}
        </div>
      </div>
    </div>
  </div>
  <footer
    class="container mt-12 pb-10 text-center text-sm text-muted-foreground"
  >
    <div class="mx-auto max-w-[610px] leading-6">
      <p class="mb-8 underline decoration-foreground/20">
        <a href="https://museumofcryptoart.com/" target="_blank">
          © {{ new Date().getFullYear() }}, Museum of Crypto Art
        </a>
      </p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { BrowserProvider } from "ethers";
import { useAppKit, useAppKitAccount, useAppKitProvider, useAppKitState } from "@reown/appkit/vue";
import { readUsers, registerUser } from "@directus/sdk";
import { cn } from "~/lib/utils";
import { normalizeWalletError, walletErrorToMessage } from "~/lib/wallet-error";

interface ResponseMessage {
  type: "success" | "error";
  message: string;
}

const isMounted = useMounted();
const modal = useAppKit();
const appKitState = useAppKitState();
const wallet = useAppKitAccount();
const { clear: clearSession } = useUserSession();
const { directus } = useDirectus();

const loading = ref(false);
const responseMessage = reactive<ResponseMessage>({
  type: "success",
  message: "",
});

// const walletAddress = computed(() => wallet.value?.address);

async function handleSignMessage() {
  const { walletProvider } = useAppKitProvider("eip155");
  // @ts-expect-error
  const provider = new BrowserProvider(walletProvider);
  const signer = await provider.getSigner();
  const address = await signer?.getAddress();
  const message = `Welcome to the Museum of Crypto Art!\n\nSign this message login. No password needed.\n\nWallet address:\n${address.toLowerCase()}`;
  return await signer?.signMessage(message);
}

async function waitFor(predicate: () => boolean, timeoutMs = 15000, intervalMs = 100) {
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

async function handleConnectAndLogin() {
  try {
    loading.value = true;
    responseMessage.message = "";

    // Ensure wallet is connected
    if (wallet.value?.status !== "connected") {
      modal.open();
      await waitFor(() => wallet.value?.status === "connected");
    }

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

    // Request signature
    let signature: string | undefined;
    try {
      signature = await handleSignMessage();
    } catch (err: any) {
      // Signature cancelled or failed
      try { await $fetch("/api/auth/logout", { method: "POST" }); } catch {}
      const norm = normalizeWalletError(err);
      const msg = walletErrorToMessage(norm);
      throw new Error(msg);
    }

    // Store signature for auto-login on future visits
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("moca_signature", signature as string);
        localStorage.setItem("moca_signature_address", addressLower as string);
      }
    } catch {}

    // Check if user exists by ethereum_address (public field)
    const users = await (directus as any).request((readUsers as any)({
      fields: [ "ethereum_address" ],
      filter: {
        ethereum_address: { _eq: addressLower },
      },
      limit: 1,
    }));

    if (!users || (Array.isArray(users) && users.length === 0)) {
      // Create user via Directus public registration using SDK
      await (directus as any).request((registerUser as any)(
        `no-email@${addressLower}.com`,
        signature as string,
        {
          ethereum_address: addressLower,
        },
      ));
    }

    // Sign in via Sidebase Credentials provider (Directus login under the hood)
    await $fetch("/api/auth/login", {
      method: "POST",
      body: {
        email: `no-email@${addressLower}.com`,
        password: signature as string,
      },
    });
    responseMessage.type = "success";
    responseMessage.message = "Logged in successfully!";
    navigateTo("/decc0s");
  } catch (e: any) {
    console.error(e);
    try {
      await $fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("moca_signature");
        localStorage.removeItem("moca_signature_address");
      }
    } catch {}
    responseMessage.type = "error";
    responseMessage.message = e?.message || "Login failed";
  } finally {
    loading.value = false;
  }
}

useHead({ title: "Login" });
</script>

<style>
.response-message {
  word-break: break-word;
}
</style>
