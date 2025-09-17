export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, fetch } = useUserSession();
  try {
    await fetch();
  } catch {}
  if (!loggedIn.value) {
    const callbackUrl = encodeURIComponent(to.fullPath);
    return navigateTo(`/login?callbackUrl=${callbackUrl}`);
  }
});
