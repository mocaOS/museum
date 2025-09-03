export default defineNuxtRouteMiddleware(async (to) => {
  const { status, getSession } = useAuth();

  try {
    await getSession?.();
  } catch {}

  if (status?.value !== "authenticated") {
    const callbackUrl = encodeURIComponent(to.fullPath);
    return navigateTo(`/login?callbackUrl=${callbackUrl}`);
  }
});
