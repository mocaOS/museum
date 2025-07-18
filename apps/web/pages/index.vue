<template>
  <div>
    <!-- This page automatically redirects to /library -->
  </div>
</template>

<script setup>
navigateTo("/library", {
  redirectCode: 301,
  external: false,
});

useHead({
  htmlAttrs: {
    lang: "en",
  },
  meta: [
    {
      "http-equiv": "refresh",
      "content": "0;url=/library",
    },
  ],
  link: [
    {
      rel: "canonical",
      href: "/library",
    },
  ],
});
</script>
