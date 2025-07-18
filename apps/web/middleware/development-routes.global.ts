/**
 * Global middleware to block development routes in production
 * Routes like /library and /test will return 404 in production
 */
import { createError } from "h3";

export default defineNuxtRouteMiddleware((to) => {
  // List of exact routes still in development
  const developmentRoutes = [
    "/claim",
    "/token",
    "/registration",
    "/directus",
  ];

  // List of route prefixes to block
  const blockedPrefixes = [
    "/test/",
  ];

  // Only block access in production environment
  if (process.env.NODE_ENV === "production"
      && (developmentRoutes.includes(to.path)
       || blockedPrefixes.some(prefix => to.path.startsWith(prefix)))) {
    // Return 404 error for development routes
    throw createError({
      statusCode: 404,
      statusMessage: "Page Not Found",
    });
  }
});
