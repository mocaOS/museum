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
        Registration
      </h1>

      <template v-if="confirmed">
        <div>
          <h2 class="font-bold">
            Confirmed
          </h2>
          <p class="mt-1 text-sm text-white/50">
            Follow us on 𝕏 and join the Discord.
          </p>

          <div
            class="
              mt-4 grid grid-cols-1 gap-4
              sm:grid-cols-2 sm:gap-8
            "
          >
            <a href="https://x.com/MuseumofCrypto" target="_blank">
              <Button class="w-full">𝕏</Button>
            </a>
            <a href="https://discord.gg/X6TjpWEYFB" target="_blank">
              <Button class="w-full">Discord</Button>
            </a>
          </div>
        </div>
      </template>

      <template v-else>
        <div>
          <h2 class="font-bold">
            Step 1
          </h2>
          <p class="mt-1 text-sm text-white/50">
            Connect your ETH/EVM address
          </p>
          <Button
            @click="handleConnect"
            v-if="wallet.status === 'connected'"
            class="mt-4 w-full font-mono text-sm"
          >
            {{ wallet.address }}
          </Button>
          <Button
            @click="handleConnect"
            v-else
            :disabled="!isMounted || appKitState.open"
            :loading="!isMounted || appKitState.open"
            class="mt-4 w-full"
          >
            Select Wallet
          </Button>
        </div>

        <div>
          <h2 class="font-bold">
            Step 2
          </h2>
          <p class="mt-1 text-sm text-white/50">
            Paste your SOL address
          </p>
          <Input
            v-model="solAddress"
            :disabled="wallet.status !== 'connected' || loading"
            placeholder="Gozt2g1cAZJAHRNV..."
            class="mt-4 font-mono"
          />
          <Button
            @click="handleConfirm"
            :disabled="wallet.status !== 'connected' || loading"
            :loading="loading"
            class="mt-6 w-full"
          >
            Confirm
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
              class="mr-1"
            />
            <Icon v-else icon="iconamoon:sign-times-circle" class="mr-1" />
            {{ responseMessage.message }}
          </div>
        </div>
      </template>
    </div>
  </div>
  <footer class="container mt-12 pb-10 text-center text-sm text-white/50">
    <div class="mx-auto max-w-[610px] leading-6">
      <p class="mb-8 underline decoration-white/20">
        <a href="https://museumofcryptoart.com/" target="_blank">
          © {{ new Date().getFullYear() }}, Museum of Crypto Art
        </a>
      </p>
      <p>This page was created to facilitate members of the MOCA community claiming $MOCA tokens. No representations are made that the distributor will work or that any particular amount of $MOCA will be claimed by holders.</p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { BrowserProvider } from "ethers";
import { useAppKit, useAppKitAccount, useAppKitProvider, useAppKitState } from "@reown/appkit/vue";
import { cn } from "~/lib/utils";

interface ResponseMessage {
  type: "success" | "error";
  message: string;
}

const isMounted = useMounted();
const modal = useAppKit();
const appKitState = useAppKitState();
const wallet = useAppKitAccount();
const user = useStrapiUser();
const { login, register, logout } = useStrapiAuth();
const { update } = useStrapi();

const solAddress = ref("");
const loading = ref(false);
const confirmed = ref(false);
const responseMessage = reactive<ResponseMessage>({
  type: "success",
  message: "",
});

const walletAddress = computed(() => wallet.value?.address);

watch(walletAddress, () => {
  logout();
});

function handleConnect() {
  modal.open();
}

async function handleSignMessage() {
  const { walletProvider } = useAppKitProvider("eip155");
  const message = `Welcome to your MOCA Multipass!\n\nClick "Sign" to sign in. No password needed!\n\nWallet address:\n${wallet.value.address.toLowerCase()}`;
  // @ts-expect-error
  const provider = new BrowserProvider(walletProvider);
  const signer = await provider.getSigner();
  return await signer?.signMessage(message);
}

async function handleConfirm() {
  try {
    loading.value = true;
    responseMessage.message = "";

    logout();

    const mocaUser = await $fetch(`https://api.museumofcryptoart.com/users/${wallet.value.address.toLowerCase()}`);
    if (!mocaUser) {
      const signature = await handleSignMessage();

      await register({
        username: wallet.value.address.toLowerCase(),
        email: `no-email@${wallet.value.address.toLowerCase()}.com`,
        password: signature,
        signature,
      });
    }

    const { PublicKey } = await import("@solana/web3.js/lib/index.esm");
    const owner = new PublicKey(solAddress.value);
    const isValid = PublicKey.isOnCurve(owner);

    if (isValid) {
      try {
        const signature = await handleSignMessage();

        await login({
          identifier: wallet.value.address.toLowerCase(),
          password: signature,
        });

        await handleUpdateUser();
      } catch (e) {
        console.error(e);
        responseMessage.type = "error";
        responseMessage.message = e.message;
      }
    }
  } catch (e) {
    console.error(e);
    responseMessage.type = "error";
    responseMessage.message = e.message;
  } finally {
    loading.value = false;
  }
}

async function handleUpdateUser() {
  try {
    loading.value = true;
    responseMessage.message = "";

    await update("users", user.value.id, {
      solAddress: solAddress.value,
    });

    responseMessage.type = "success";
    responseMessage.message = "Your SOL address has been updated!";
    solAddress.value = "";
  } catch (e) {
    console.error(e);
    responseMessage.type = "error";
    responseMessage.message = e.message;
  } finally {
    loading.value = false;
  }
}

useHead({ title: "Registration" });
</script>

<style>
.response-message {
  word-break: break-word;
}
</style>
