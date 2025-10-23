<template>
  <div class="container mt-10 space-y-14">
    <div
      class="
        mx-auto max-w-[580px] space-y-12 rounded-xl border border-border
        bg-background p-4
        sm:rounded-3xl sm:p-14
      "
    >
      <NuxtImg
        preload
        width="112"
        src="/images/globe.png"
        alt="Globe"
        class="mx-auto"
      />
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
async function handleLogin() {
  navigateTo("/login?from=directus-page");
}
</script>
