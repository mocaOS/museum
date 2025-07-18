/**
 * Temporary redirect middleware for Nuxt 3
 * Redirects specified routes to the root path
 */
export default defineNuxtRouteMiddleware(() => {
  return navigateTo("/", { redirectCode: 302 });
});
