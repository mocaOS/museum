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
        Decc0s
      </h1>
      <p class="text-white/60">
        This is a placeholder page for Decc0s.
      </p>
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
useHead({ title: "Decc0s" });
definePageMeta({
  middleware: ["auth"],
});
</script>


